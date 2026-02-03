package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strings"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/joho/godotenv"
)

// MoltbookPost represents a post from the Moltbook API
type MoltbookPost struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	Content      string    `json:"content"`
	URL          string    `json:"url"`
	Upvotes      int       `json:"upvotes"`
	Downvotes    int       `json:"downvotes"`
	CommentCount int       `json:"comment_count"`
	CreatedAt    time.Time `json:"created_at"`
	Author       *Author   `json:"author"`
	Submolt      *Submolt  `json:"submolt"`
}

// MoltbookComment represents a comment from the Moltbook API
type MoltbookComment struct {
	ID        string            `json:"id"`
	PostID    string            `json:"post_id"`
	ParentID  *string           `json:"parent_id"`
	Content   string            `json:"content"`
	Upvotes   int               `json:"upvotes"`
	Downvotes int               `json:"downvotes"`
	CreatedAt time.Time         `json:"created_at"`
	Author    *Author           `json:"author"`
	Replies   []MoltbookComment `json:"replies"`
}

type Author struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
}

type Submolt struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
}

type FeedResponse struct {
	Success bool           `json:"success"`
	Posts   []MoltbookPost `json:"posts"`
	Count   int            `json:"count"`
	HasMore bool           `json:"has_more"`
}

type CommentsResponse struct {
	Success  bool              `json:"success"`
	Comments []MoltbookComment `json:"comments"`
	Count    int               `json:"count"`
}

// ScannedMessage represents a message stored in ClickHouse
type ScannedMessage struct {
	ID           string
	MessageType  string // "post" or "comment"
	PostID       string
	ParentID     string
	Title        string
	Content      string
	AuthorID     string
	AuthorName   string
	SubmoltID    string
	SubmoltName  string
	Upvotes      int
	Downvotes    int
	CommentCount int
	MessageURL   string
	CreatedAt    time.Time
	ScannedAt    time.Time
	HasAPIKey    bool
	APIKeyTypes  []string
}

// APIKeyFinding represents a found API key in a post
type APIKeyFinding struct {
	PostID        string
	PostTitle     string
	AuthorName    string
	SubmoltName   string
	APIKey        string
	APIKeyType    string
	Content       string
	PostURL       string
	FoundAt       time.Time
	PostCreatedAt time.Time
}

// Scanner is the main service struct
type Scanner struct {
	moltbookAPIKey string
	clickhouseConn driver.Conn
	httpClient     *http.Client
	apiKeyPatterns []*regexp.Regexp
	baseURL        string
	pollInterval   time.Duration
	seenMessages   map[string]bool // tracks both posts and comments by ID
	databaseName   string
}

// NewScanner creates a new scanner instance
func NewScanner() (*Scanner, error) {
	// Load environment variables
	_ = godotenv.Load()

	moltbookAPIKey := os.Getenv("MOLTBOOK_API_KEY")
	if moltbookAPIKey == "" {
		return nil, fmt.Errorf("MOLTBOOK_API_KEY environment variable is required")
	}

	clickhouseHost := getEnvOrDefault("CLICKHOUSE_HOST", "localhost")
	clickhousePort := getEnvOrDefault("CLICKHOUSE_PORT", "9000")
	clickhouseDB := getEnvOrDefault("CLICKHOUSE_DATABASE", "moltbook")
	clickhouseUser := getEnvOrDefault("CLICKHOUSE_USER", "default")
	clickhousePassword := os.Getenv("CLICKHOUSE_PASSWORD")

	pollIntervalStr := getEnvOrDefault("POLL_INTERVAL", "60s")
	pollInterval, err := time.ParseDuration(pollIntervalStr)
	if err != nil {
		pollInterval = 60 * time.Second
	}

	// First connect to ClickHouse without specifying database to create it
	initConn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{fmt.Sprintf("%s:%s", clickhouseHost, clickhousePort)},
		Auth: clickhouse.Auth{
			Username: clickhouseUser,
			Password: clickhousePassword,
		},
		Settings: clickhouse.Settings{
			"max_execution_time": 60,
		},
		Compression: &clickhouse.Compression{
			Method: clickhouse.CompressionLZ4,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to ClickHouse: %w", err)
	}

	// Create database if it doesn't exist
	if err := initConn.Exec(context.Background(), fmt.Sprintf("CREATE DATABASE IF NOT EXISTS %s", clickhouseDB)); err != nil {
		initConn.Close()
		return nil, fmt.Errorf("failed to create database: %w", err)
	}
	initConn.Close()

	// Now connect to the specific database
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{fmt.Sprintf("%s:%s", clickhouseHost, clickhousePort)},
		Auth: clickhouse.Auth{
			Database: clickhouseDB,
			Username: clickhouseUser,
			Password: clickhousePassword,
		},
		Settings: clickhouse.Settings{
			"max_execution_time": 60,
		},
		Compression: &clickhouse.Compression{
			Method: clickhouse.CompressionLZ4,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to ClickHouse database: %w", err)
	}

	// Test connection
	if err := conn.Ping(context.Background()); err != nil {
		return nil, fmt.Errorf("failed to ping ClickHouse: %w", err)
	}

	// Compile API key patterns
	patterns := compileAPIKeyPatterns()

	return &Scanner{
		moltbookAPIKey: moltbookAPIKey,
		clickhouseConn: conn,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		apiKeyPatterns: patterns,
		baseURL:        "https://www.moltbook.com/api/v1",
		pollInterval:   pollInterval,
		seenMessages:   make(map[string]bool),
		databaseName:   clickhouseDB,
	}, nil
}

// compileAPIKeyPatterns returns compiled regex patterns for various API keys
func compileAPIKeyPatterns() []*regexp.Regexp {
	patterns := []string{
		// OpenAI
		`sk-[a-zA-Z0-9]{20,}`,
		`sk-proj-[a-zA-Z0-9_-]{20,}`,
		// Anthropic
		`sk-ant-[a-zA-Z0-9_-]{20,}`,
		// Google/GCP
		`AIza[0-9A-Za-z_-]{35}`,
		// AWS
		`AKIA[0-9A-Z]{16}`,
		`ASIA[0-9A-Z]{16}`,
		// GitHub
		`ghp_[a-zA-Z0-9]{36}`,
		`gho_[a-zA-Z0-9]{36}`,
		`ghu_[a-zA-Z0-9]{36}`,
		`ghs_[a-zA-Z0-9]{36}`,
		`ghr_[a-zA-Z0-9]{36}`,
		`github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}`,
		// Stripe
		`sk_live_[0-9a-zA-Z]{24,}`,
		`sk_test_[0-9a-zA-Z]{24,}`,
		`rk_live_[0-9a-zA-Z]{24,}`,
		`rk_test_[0-9a-zA-Z]{24,}`,
		// Twilio
		`SK[0-9a-fA-F]{32}`,
		// SendGrid
		`SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}`,
		// Slack
		`xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}`,
		`xoxp-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}`,
		`xoxa-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}`,
		// Discord
		`[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27}`,
		// Telegram
		`[0-9]{8,10}:[a-zA-Z0-9_-]{35}`,
		// Supabase
		`sbp_[a-zA-Z0-9]{40,}`,
		`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+`,
		// Moltbook
		`moltbook_sk_[a-zA-Z0-9_-]{20,}`,
		// Generic API key patterns
		`api[_-]?key[_-]?[=:]["']?[a-zA-Z0-9_-]{20,}["']?`,
		`apikey[=:]["']?[a-zA-Z0-9_-]{20,}["']?`,
		`secret[_-]?key[_-]?[=:]["']?[a-zA-Z0-9_-]{20,}["']?`,
		`access[_-]?token[=:]["']?[a-zA-Z0-9_-]{20,}["']?`,
		`bearer\s+[a-zA-Z0-9_-]{20,}`,
		// Private keys (partial match)
		`-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----`,
		`-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----`,
	}

	compiled := make([]*regexp.Regexp, 0, len(patterns))
	for _, p := range patterns {
		re, err := regexp.Compile(`(?i)` + p)
		if err != nil {
			log.Printf("Warning: failed to compile pattern %s: %v", p, err)
			continue
		}
		compiled = append(compiled, re)
	}

	return compiled
}

// getAPIKeyType returns a human-readable type for the matched API key
func getAPIKeyType(key string) string {
	key = strings.ToLower(key)
	switch {
	case strings.HasPrefix(key, "sk-ant-"):
		return "Anthropic"
	case strings.HasPrefix(key, "sk-proj-"), strings.HasPrefix(key, "sk-"):
		return "OpenAI"
	case strings.HasPrefix(key, "aiza"):
		return "Google"
	case strings.HasPrefix(key, "akia"), strings.HasPrefix(key, "asia"):
		return "AWS"
	case strings.HasPrefix(key, "ghp_"), strings.HasPrefix(key, "gho_"), strings.HasPrefix(key, "ghu_"), strings.HasPrefix(key, "ghs_"), strings.HasPrefix(key, "ghr_"), strings.HasPrefix(key, "github_pat_"):
		return "GitHub"
	case strings.HasPrefix(key, "sk_live_"), strings.HasPrefix(key, "sk_test_"), strings.HasPrefix(key, "rk_live_"), strings.HasPrefix(key, "rk_test_"):
		return "Stripe"
	case strings.HasPrefix(key, "sg."):
		return "SendGrid"
	case strings.HasPrefix(key, "xoxb-"), strings.HasPrefix(key, "xoxp-"), strings.HasPrefix(key, "xoxa-"):
		return "Slack"
	case strings.HasPrefix(key, "sbp_"):
		return "Supabase"
	case strings.HasPrefix(key, "moltbook_sk_"):
		return "Moltbook"
	case strings.Contains(key, "begin") && strings.Contains(key, "private key"):
		return "PrivateKey"
	case strings.Contains(key, "api") || strings.Contains(key, "secret") || strings.Contains(key, "token"):
		return "Generic"
	default:
		return "Unknown"
	}
}

// InitDatabase creates the necessary tables in ClickHouse
func (s *Scanner) InitDatabase(ctx context.Context) error {
	db := s.databaseName

	queries := []string{
		// Ensure database exists (redundant but safe)
		fmt.Sprintf(`CREATE DATABASE IF NOT EXISTS %s`, db),
		// API key findings table
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s.api_key_findings (
			id UUID DEFAULT generateUUIDv4(),
			post_id String,
			post_title String,
			author_name String,
			submolt_name String,
			api_key String,
			api_key_type String,
			content String,
			post_url String,
			found_at DateTime64(3),
			post_created_at DateTime64(3),
			created_at DateTime64(3) DEFAULT now64(3)
		) ENGINE = MergeTree()
		ORDER BY (found_at, post_id)`, db),
		// Messages table - stores all scanned posts and comments
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s.messages (
			id String,
			message_type LowCardinality(String),
			post_id String,
			parent_id String,
			title String,
			content String,
			author_id String,
			author_name String,
			submolt_id String,
			submolt_name String,
			upvotes Int32,
			downvotes Int32,
			comment_count Int32,
			message_url String,
			created_at DateTime64(3),
			scanned_at DateTime64(3) DEFAULT now64(3),
			has_api_key UInt8,
			api_key_types Array(String)
		) ENGINE = MergeTree()
		ORDER BY (scanned_at, message_type, id)`, db),
	}

	for _, query := range queries {
		if err := s.clickhouseConn.Exec(ctx, query); err != nil {
			return fmt.Errorf("failed to execute migration query: %w", err)
		}
	}

	log.Printf("Database '%s' initialized successfully (2 tables ready)", db)
	return nil
}

// LoadSeenMessages loads previously scanned message IDs from the database
func (s *Scanner) LoadSeenMessages(ctx context.Context) error {
	db := s.databaseName

	// Load from messages table
	rows, err := s.clickhouseConn.Query(ctx, fmt.Sprintf(`SELECT id FROM %s.messages`, db))
	if err != nil {
		return fmt.Errorf("failed to query messages: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return fmt.Errorf("failed to scan message ID: %w", err)
		}
		s.seenMessages[id] = true
	}

	log.Printf("Loaded %d previously scanned messages", len(s.seenMessages))
	return nil
}

// FetchFeed fetches posts from the Moltbook API
func (s *Scanner) FetchFeed(ctx context.Context, sort string, limit int) ([]MoltbookPost, error) {
	url := fmt.Sprintf("%s/posts?sort=%s&limit=%d", s.baseURL, sort, limit)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+s.moltbookAPIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch feed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	var feedResp FeedResponse
	if err := json.NewDecoder(resp.Body).Decode(&feedResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if !feedResp.Success {
		return nil, fmt.Errorf("API returned success=false")
	}

	return feedResp.Posts, nil
}

// FetchComments fetches comments for a specific post from the Moltbook API
func (s *Scanner) FetchComments(ctx context.Context, postID string) ([]MoltbookComment, error) {
	url := fmt.Sprintf("%s/posts/%s/comments", s.baseURL, postID)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+s.moltbookAPIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch comments: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	var commentsResp CommentsResponse
	if err := json.NewDecoder(resp.Body).Decode(&commentsResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if !commentsResp.Success {
		return nil, fmt.Errorf("API returned success=false")
	}

	// Flatten nested comments
	var allComments []MoltbookComment
	var flatten func(comments []MoltbookComment)
	flatten = func(comments []MoltbookComment) {
		for _, c := range comments {
			allComments = append(allComments, c)
			if len(c.Replies) > 0 {
				flatten(c.Replies)
			}
		}
	}
	flatten(commentsResp.Comments)

	return allComments, nil
}

// FetchRecentComments fetches recent comments from all posts
func (s *Scanner) FetchRecentComments(ctx context.Context) ([]MoltbookComment, error) {
	url := fmt.Sprintf("%s/comments?sort=new&limit=100", s.baseURL)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+s.moltbookAPIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch comments: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	var commentsResp CommentsResponse
	if err := json.NewDecoder(resp.Body).Decode(&commentsResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if !commentsResp.Success {
		return nil, fmt.Errorf("API returned success=false")
	}

	return commentsResp.Comments, nil
}

// ScanText scans text for API keys and returns the found keys with their types
func (s *Scanner) ScanText(text string) ([]string, []string) {
	var keys []string
	var types []string
	foundKeys := make(map[string]bool)

	for _, pattern := range s.apiKeyPatterns {
		matches := pattern.FindAllString(text, -1)
		for _, match := range matches {
			normalizedKey := strings.TrimSpace(match)
			if foundKeys[normalizedKey] {
				continue
			}
			foundKeys[normalizedKey] = true
			keys = append(keys, normalizedKey)
			types = append(types, getAPIKeyType(normalizedKey))
		}
	}

	return keys, types
}

// ScanPost scans a post for API keys and returns findings
func (s *Scanner) ScanPost(post MoltbookPost) []APIKeyFinding {
	var findings []APIKeyFinding

	// Combine title and content for scanning
	textToScan := post.Title + "\n" + post.Content

	// Track unique keys to avoid duplicates in the same post
	foundKeys := make(map[string]bool)

	for _, pattern := range s.apiKeyPatterns {
		matches := pattern.FindAllString(textToScan, -1)
		for _, match := range matches {
			// Normalize the key for deduplication
			normalizedKey := strings.TrimSpace(match)
			if foundKeys[normalizedKey] {
				continue
			}
			foundKeys[normalizedKey] = true

			authorName := "Unknown"
			if post.Author != nil {
				authorName = post.Author.Name
			}

			submoltName := "general"
			if post.Submolt != nil {
				submoltName = post.Submolt.Name
			}

			finding := APIKeyFinding{
				PostID:        post.ID,
				PostTitle:     post.Title,
				AuthorName:    authorName,
				SubmoltName:   submoltName,
				APIKey:        normalizedKey,
				APIKeyType:    getAPIKeyType(normalizedKey),
				Content:       truncateString(post.Content, 1000),
				PostURL:       fmt.Sprintf("https://www.moltbook.com/post/%s", post.ID),
				FoundAt:       time.Now(),
				PostCreatedAt: post.CreatedAt,
			}
			findings = append(findings, finding)
		}
	}

	return findings
}

// ScanComment scans a comment for API keys and returns findings
func (s *Scanner) ScanComment(comment MoltbookComment, postTitle string, submoltName string) []APIKeyFinding {
	var findings []APIKeyFinding
	foundKeys := make(map[string]bool)

	for _, pattern := range s.apiKeyPatterns {
		matches := pattern.FindAllString(comment.Content, -1)
		for _, match := range matches {
			normalizedKey := strings.TrimSpace(match)
			if foundKeys[normalizedKey] {
				continue
			}
			foundKeys[normalizedKey] = true

			authorName := "Unknown"
			if comment.Author != nil {
				authorName = comment.Author.Name
			}

			finding := APIKeyFinding{
				PostID:        comment.PostID,
				PostTitle:     postTitle + " (comment)",
				AuthorName:    authorName,
				SubmoltName:   submoltName,
				APIKey:        normalizedKey,
				APIKeyType:    getAPIKeyType(normalizedKey),
				Content:       truncateString(comment.Content, 1000),
				PostURL:       fmt.Sprintf("https://www.moltbook.com/post/%s", comment.PostID),
				FoundAt:       time.Now(),
				PostCreatedAt: comment.CreatedAt,
			}
			findings = append(findings, finding)
		}
	}

	return findings
}

// SaveFinding saves an API key finding to ClickHouse
func (s *Scanner) SaveFinding(ctx context.Context, finding APIKeyFinding) error {
	query := fmt.Sprintf(`INSERT INTO %s.api_key_findings 
		(post_id, post_title, author_name, submolt_name, api_key, api_key_type, content, post_url, found_at, post_created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, s.databaseName)

	err := s.clickhouseConn.Exec(ctx, query,
		finding.PostID,
		finding.PostTitle,
		finding.AuthorName,
		finding.SubmoltName,
		finding.APIKey,
		finding.APIKeyType,
		finding.Content,
		finding.PostURL,
		finding.FoundAt,
		finding.PostCreatedAt,
	)
	if err != nil {
		return err
	}

	return nil
}

// SaveMessage saves a scanned message (post or comment) to ClickHouse
func (s *Scanner) SaveMessage(ctx context.Context, msg ScannedMessage) error {
	query := fmt.Sprintf(`INSERT INTO %s.messages 
		(id, message_type, post_id, parent_id, title, content, author_id, author_name, 
		 submolt_id, submolt_name, upvotes, downvotes, comment_count, message_url, 
		 created_at, has_api_key, api_key_types)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, s.databaseName)

	hasAPIKey := uint8(0)
	if msg.HasAPIKey {
		hasAPIKey = 1
	}

	return s.clickhouseConn.Exec(ctx, query,
		msg.ID,
		msg.MessageType,
		msg.PostID,
		msg.ParentID,
		msg.Title,
		msg.Content,
		msg.AuthorID,
		msg.AuthorName,
		msg.SubmoltID,
		msg.SubmoltName,
		msg.Upvotes,
		msg.Downvotes,
		msg.CommentCount,
		msg.MessageURL,
		msg.CreatedAt,
		hasAPIKey,
		msg.APIKeyTypes,
	)
}

// PostToMessage converts a MoltbookPost to a ScannedMessage
func (s *Scanner) PostToMessage(post MoltbookPost) ScannedMessage {
	authorID := ""
	authorName := "Unknown"
	if post.Author != nil {
		authorID = post.Author.ID
		authorName = post.Author.Name
	}

	submoltID := ""
	submoltName := "general"
	if post.Submolt != nil {
		submoltID = post.Submolt.ID
		submoltName = post.Submolt.Name
	}

	_, apiKeyTypes := s.ScanText(post.Title + "\n" + post.Content)

	return ScannedMessage{
		ID:           post.ID,
		MessageType:  "post",
		PostID:       post.ID,
		ParentID:     "",
		Title:        post.Title,
		Content:      post.Content,
		AuthorID:     authorID,
		AuthorName:   authorName,
		SubmoltID:    submoltID,
		SubmoltName:  submoltName,
		Upvotes:      post.Upvotes,
		Downvotes:    post.Downvotes,
		CommentCount: post.CommentCount,
		MessageURL:   fmt.Sprintf("https://www.moltbook.com/post/%s", post.ID),
		CreatedAt:    post.CreatedAt,
		ScannedAt:    time.Now(),
		HasAPIKey:    len(apiKeyTypes) > 0,
		APIKeyTypes:  apiKeyTypes,
	}
}

// CommentToMessage converts a MoltbookComment to a ScannedMessage
func (s *Scanner) CommentToMessage(comment MoltbookComment, submoltName string) ScannedMessage {
	authorID := ""
	authorName := "Unknown"
	if comment.Author != nil {
		authorID = comment.Author.ID
		authorName = comment.Author.Name
	}

	parentID := ""
	if comment.ParentID != nil {
		parentID = *comment.ParentID
	}

	_, apiKeyTypes := s.ScanText(comment.Content)

	return ScannedMessage{
		ID:           comment.ID,
		MessageType:  "comment",
		PostID:       comment.PostID,
		ParentID:     parentID,
		Title:        "",
		Content:      comment.Content,
		AuthorID:     authorID,
		AuthorName:   authorName,
		SubmoltID:    "",
		SubmoltName:  submoltName,
		Upvotes:      comment.Upvotes,
		Downvotes:    comment.Downvotes,
		CommentCount: 0,
		MessageURL:   fmt.Sprintf("https://www.moltbook.com/post/%s", comment.PostID),
		CreatedAt:    comment.CreatedAt,
		ScannedAt:    time.Now(),
		HasAPIKey:    len(apiKeyTypes) > 0,
		APIKeyTypes:  apiKeyTypes,
	}
}

// Run starts the scanner loop
func (s *Scanner) Run(ctx context.Context) error {
	log.Printf("Starting Moltbook API Key Scanner (poll interval: %s)", s.pollInterval)

	// Initialize database
	if err := s.InitDatabase(ctx); err != nil {
		return fmt.Errorf("failed to initialize database: %w", err)
	}

	// Load previously scanned messages
	if err := s.LoadSeenMessages(ctx); err != nil {
		log.Printf("Warning: failed to load seen messages: %v", err)
	}

	// Initial scan
	if err := s.scan(ctx); err != nil {
		log.Printf("Initial scan error: %v", err)
	}

	// Start periodic scanning
	ticker := time.NewTicker(s.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("Shutting down scanner...")
			return nil
		case <-ticker.C:
			if err := s.scan(ctx); err != nil {
				log.Printf("Scan error: %v", err)
			}
		}
	}
}

// scan performs a single scan of the feed and comments
func (s *Scanner) scan(ctx context.Context) error {
	newMessages := 0
	newPosts := 0
	newComments := 0
	totalFindings := 0
	saveErrors := 0

	// Fetch and scan posts
	posts, err := s.FetchFeed(ctx, "new", 100)
	if err != nil {
		log.Printf("Error fetching feed: %v", err)
	} else {
		for _, post := range posts {
			// Skip already scanned posts
			if s.seenMessages[post.ID] {
				continue
			}

			newMessages++
			newPosts++

			// Convert to message and save
			msg := s.PostToMessage(post)
			if err := s.SaveMessage(ctx, msg); err != nil {
				saveErrors++
			}

			// Scan the post for API keys
			findings := s.ScanPost(post)

			for _, finding := range findings {
				if err := s.SaveFinding(ctx, finding); err != nil {
					saveErrors++
				} else {
					totalFindings++
				}
			}

			s.seenMessages[post.ID] = true

			// Fetch and scan comments for this post if it has any
			if post.CommentCount > 0 {
				s.scanPostComments(ctx, post, &newMessages, &newComments, &totalFindings, &saveErrors)
			}
		}
	}

	// Also try to fetch recent comments directly (some APIs support this)
	s.scanRecentComments(ctx, &newMessages, &newComments, &totalFindings, &saveErrors)

	// Log summary
	if newMessages > 0 || totalFindings > 0 {
		log.Printf("📊 Scan complete: %d new messages (%d posts, %d comments), %d API keys found",
			newMessages, newPosts, newComments, totalFindings)
		if saveErrors > 0 {
			log.Printf("⚠️  %d save errors occurred", saveErrors)
		}
		if totalFindings > 0 {
			log.Printf("🔑 Found %d exposed API keys!", totalFindings)
		}
	}
	return nil
}

// scanPostComments scans comments for a specific post
func (s *Scanner) scanPostComments(ctx context.Context, post MoltbookPost, newMessages *int, newComments *int, totalFindings *int, saveErrors *int) {
	comments, err := s.FetchComments(ctx, post.ID)
	if err != nil {
		// Don't log every comment fetch error - too noisy
		return
	}

	submoltName := "general"
	if post.Submolt != nil {
		submoltName = post.Submolt.Name
	}

	for _, comment := range comments {
		if s.seenMessages[comment.ID] {
			continue
		}

		*newMessages++
		*newComments++

		// Convert to message and save
		msg := s.CommentToMessage(comment, submoltName)
		if err := s.SaveMessage(ctx, msg); err != nil {
			*saveErrors++
		}

		// Scan for API keys
		findings := s.ScanComment(comment, post.Title, submoltName)
		for _, finding := range findings {
			if err := s.SaveFinding(ctx, finding); err != nil {
				*saveErrors++
			} else {
				*totalFindings++
			}
		}

		s.seenMessages[comment.ID] = true
	}
}

// scanRecentComments tries to fetch recent comments directly
func (s *Scanner) scanRecentComments(ctx context.Context, newMessages *int, newComments *int, totalFindings *int, saveErrors *int) {
	comments, err := s.FetchRecentComments(ctx)
	if err != nil {
		// This endpoint might not exist, silently skip
		return
	}

	for _, comment := range comments {
		if s.seenMessages[comment.ID] {
			continue
		}

		*newMessages++
		*newComments++

		// Convert to message and save
		msg := s.CommentToMessage(comment, "")
		if err := s.SaveMessage(ctx, msg); err != nil {
			*saveErrors++
		}

		// Scan for API keys
		findings := s.ScanComment(comment, "", "")
		for _, finding := range findings {
			if err := s.SaveFinding(ctx, finding); err != nil {
				*saveErrors++
			} else {
				*totalFindings++
			}
		}

		s.seenMessages[comment.ID] = true
	}
}

// Close closes the scanner's resources
func (s *Scanner) Close() error {
	return s.clickhouseConn.Close()
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func main() {
	scanner, err := NewScanner()
	if err != nil {
		log.Fatalf("Failed to create scanner: %v", err)
	}
	defer scanner.Close()

	// Setup context with signal handling
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle shutdown signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("Received shutdown signal")
		cancel()
	}()

	// Run the scanner
	if err := scanner.Run(ctx); err != nil {
		log.Fatalf("Scanner error: %v", err)
	}
}
