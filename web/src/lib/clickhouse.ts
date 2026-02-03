import { createClient } from "@clickhouse/client";

// ClickHouse client singleton
let client: ReturnType<typeof createClient> | null = null;

export function getClickHouseClient() {
  if (!client) {
    client = createClient({
      host: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
      username: process.env.CLICKHOUSE_USER || "default",
      password: process.env.CLICKHOUSE_PASSWORD || "",
      database: process.env.CLICKHOUSE_DATABASE || "moltbook",
    });
  }
  return client;
}

// Types for findings
export interface APIKeyFinding {
  id: string;
  post_id: string;
  post_title: string;
  author_name: string;
  submolt_name: string;
  api_key: string;
  api_key_type: string;
  content: string;
  post_url: string;
  found_at: string;
  post_created_at: string;
  created_at: string;
}

// Types for messages
export interface ScannedMessage {
  id: string;
  message_type: string;
  post_id: string;
  parent_id: string;
  title: string;
  content: string;
  author_id: string;
  author_name: string;
  submolt_id: string;
  submolt_name: string;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  message_url: string;
  created_at: string;
  scanned_at: string;
  has_api_key: boolean;
  api_key_types: string[];
}

// Types for patterns
export interface APIKeyPattern {
  id: string;
  name: string;
  pattern: string;
  description: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// Get findings from ClickHouse
export async function getFindings(limit: number = 100, offset: number = 0): Promise<APIKeyFinding[]> {
  const client = getClickHouseClient();
  
  const result = await client.query({
    query: `
      SELECT 
        id,
        post_id,
        post_title,
        author_name,
        submolt_name,
        api_key,
        api_key_type,
        content,
        post_url,
        toString(found_at) as found_at,
        toString(post_created_at) as post_created_at,
        toString(created_at) as created_at
      FROM api_key_findings 
      ORDER BY found_at DESC 
      LIMIT {limit:UInt32} OFFSET {offset:UInt32}
    `,
    query_params: { limit, offset },
    format: "JSONEachRow",
  });

  return result.json();
}

// Get findings count
export async function getFindingsCount(): Promise<number> {
  const client = getClickHouseClient();
  
  const result = await client.query({
    query: "SELECT count() as count FROM api_key_findings",
    format: "JSONEachRow",
  });

  const rows = await result.json() as { count: string }[];
  return parseInt(rows[0]?.count || "0", 10);
}

// Get findings stats by type
export async function getFindingsStats(): Promise<{ api_key_type: string; count: number }[]> {
  const client = getClickHouseClient();
  
  const result = await client.query({
    query: `
      SELECT 
        api_key_type,
        count() as count 
      FROM api_key_findings 
      GROUP BY api_key_type 
      ORDER BY count DESC
    `,
    format: "JSONEachRow",
  });

  const rows = await result.json() as { api_key_type: string; count: string }[];
  return rows.map(r => ({ api_key_type: r.api_key_type, count: parseInt(r.count, 10) }));
}

// Get messages from ClickHouse
export async function getMessages(
  limit: number = 100, 
  offset: number = 0,
  messageType?: string,
  hasAPIKey?: boolean
): Promise<ScannedMessage[]> {
  const client = getClickHouseClient();
  
  let whereClause = "1=1";
  if (messageType) {
    whereClause += ` AND message_type = '${messageType}'`;
  }
  if (hasAPIKey !== undefined) {
    whereClause += ` AND has_api_key = ${hasAPIKey ? 1 : 0}`;
  }
  
  const result = await client.query({
    query: `
      SELECT 
        id,
        message_type,
        post_id,
        parent_id,
        title,
        content,
        author_id,
        author_name,
        submolt_id,
        submolt_name,
        upvotes,
        downvotes,
        comment_count,
        message_url,
        toString(created_at) as created_at,
        toString(scanned_at) as scanned_at,
        has_api_key,
        api_key_types
      FROM messages
      WHERE ${whereClause}
      ORDER BY scanned_at DESC 
      LIMIT {limit:UInt32} OFFSET {offset:UInt32}
    `,
    query_params: { limit, offset },
    format: "JSONEachRow",
  });

  type RawMessage = Omit<ScannedMessage, 'has_api_key'> & { has_api_key: number };
  const rows = await result.json() as RawMessage[];
  return rows.map((r): ScannedMessage => ({
    id: r.id,
    message_type: r.message_type,
    post_id: r.post_id,
    parent_id: r.parent_id,
    title: r.title,
    content: r.content,
    author_id: r.author_id,
    author_name: r.author_name,
    submolt_id: r.submolt_id,
    submolt_name: r.submolt_name,
    upvotes: r.upvotes,
    downvotes: r.downvotes,
    comment_count: r.comment_count,
    message_url: r.message_url,
    created_at: r.created_at,
    scanned_at: r.scanned_at,
    has_api_key: r.has_api_key === 1,
    api_key_types: r.api_key_types,
  }));
}

// Get messages count
export async function getMessagesCount(messageType?: string, hasAPIKey?: boolean): Promise<number> {
  const client = getClickHouseClient();
  
  let whereClause = "1=1";
  if (messageType) {
    whereClause += ` AND message_type = '${messageType}'`;
  }
  if (hasAPIKey !== undefined) {
    whereClause += ` AND has_api_key = ${hasAPIKey ? 1 : 0}`;
  }
  
  const result = await client.query({
    query: `SELECT count() as count FROM messages WHERE ${whereClause}`,
    format: "JSONEachRow",
  });

  const rows = await result.json() as { count: string }[];
  return parseInt(rows[0]?.count || "0", 10);
}

// Get messages stats
export async function getMessagesStats(): Promise<{
  total: number;
  posts: number;
  comments: number;
  with_api_keys: number;
}> {
  const client = getClickHouseClient();
  
  const result = await client.query({
    query: `
      SELECT 
        count() as total,
        countIf(message_type = 'post') as posts,
        countIf(message_type = 'comment') as comments,
        countIf(has_api_key = 1) as with_api_keys
      FROM messages
    `,
    format: "JSONEachRow",
  });

  const rows = await result.json() as { total: string; posts: string; comments: string; with_api_keys: string }[];
  const row = rows[0] || { total: "0", posts: "0", comments: "0", with_api_keys: "0" };
  return {
    total: parseInt(row.total, 10),
    posts: parseInt(row.posts, 10),
    comments: parseInt(row.comments, 10),
    with_api_keys: parseInt(row.with_api_keys, 10),
  };
}

// Patterns table management
export async function ensurePatternsTable(): Promise<void> {
  const client = getClickHouseClient();
  
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS api_key_patterns (
        id UUID DEFAULT generateUUIDv4(),
        name String,
        pattern String,
        description String,
        enabled UInt8 DEFAULT 1,
        created_at DateTime64(3) DEFAULT now64(3),
        updated_at DateTime64(3) DEFAULT now64(3)
      ) ENGINE = MergeTree()
      ORDER BY (name)
    `,
  });
}

// Get all patterns
export async function getPatterns(): Promise<APIKeyPattern[]> {
  const client = getClickHouseClient();
  await ensurePatternsTable();
  
  const result = await client.query({
    query: `
      SELECT 
        id,
        name,
        pattern,
        description,
        enabled,
        toString(created_at) as created_at,
        toString(updated_at) as updated_at
      FROM api_key_patterns 
      ORDER BY name
    `,
    format: "JSONEachRow",
  });

  type RawPattern = Omit<APIKeyPattern, 'enabled'> & { enabled: number };
  const rows = await result.json() as RawPattern[];
  return rows.map((r): APIKeyPattern => ({
    id: r.id,
    name: r.name,
    pattern: r.pattern,
    description: r.description,
    enabled: r.enabled === 1,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

// Add a new pattern
export async function addPattern(name: string, pattern: string, description: string): Promise<void> {
  const client = getClickHouseClient();
  await ensurePatternsTable();
  
  await client.insert({
    table: "api_key_patterns",
    values: [{ name, pattern, description, enabled: 1 }],
    format: "JSONEachRow",
  });
}

// Update pattern enabled status
export async function updatePatternEnabled(id: string, enabled: boolean): Promise<void> {
  const client = getClickHouseClient();
  
  await client.command({
    query: `
      ALTER TABLE api_key_patterns 
      UPDATE enabled = {enabled:UInt8}, updated_at = now64(3) 
      WHERE id = {id:UUID}
    `,
    query_params: { id, enabled: enabled ? 1 : 0 },
  });
}

// Delete a pattern
export async function deletePattern(id: string): Promise<void> {
  const client = getClickHouseClient();
  
  await client.command({
    query: "ALTER TABLE api_key_patterns DELETE WHERE id = {id:UUID}",
    query_params: { id },
  });
}

// Seed default patterns if table is empty
export async function seedDefaultPatterns(): Promise<void> {
  const client = getClickHouseClient();
  await ensurePatternsTable();
  
  const countResult = await client.query({
    query: "SELECT count() as count FROM api_key_patterns",
    format: "JSONEachRow",
  });
  
  const rows = await countResult.json() as { count: string }[];
  if (parseInt(rows[0]?.count || "0", 10) > 0) {
    return; // Already has patterns
  }

  const defaultPatterns = [
    { name: "OpenAI", pattern: "sk-[a-zA-Z0-9]{20,}", description: "OpenAI API keys" },
    { name: "OpenAI Project", pattern: "sk-proj-[a-zA-Z0-9_-]{20,}", description: "OpenAI project keys" },
    { name: "Anthropic", pattern: "sk-ant-[a-zA-Z0-9_-]{20,}", description: "Anthropic Claude API keys" },
    { name: "Google AI", pattern: "AIza[0-9A-Za-z_-]{35}", description: "Google API keys" },
    { name: "AWS Access Key", pattern: "AKIA[0-9A-Z]{16}", description: "AWS access key IDs" },
    { name: "AWS Session", pattern: "ASIA[0-9A-Z]{16}", description: "AWS session tokens" },
    { name: "GitHub PAT", pattern: "ghp_[a-zA-Z0-9]{36}", description: "GitHub personal access tokens" },
    { name: "GitHub OAuth", pattern: "gho_[a-zA-Z0-9]{36}", description: "GitHub OAuth tokens" },
    { name: "GitHub App", pattern: "ghu_[a-zA-Z0-9]{36}", description: "GitHub user tokens" },
    { name: "GitHub Fine-grained", pattern: "github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}", description: "GitHub fine-grained PATs" },
    { name: "Stripe Live", pattern: "sk_live_[0-9a-zA-Z]{24,}", description: "Stripe live secret keys" },
    { name: "Stripe Test", pattern: "sk_test_[0-9a-zA-Z]{24,}", description: "Stripe test secret keys" },
    { name: "SendGrid", pattern: "SG\\.[a-zA-Z0-9_-]{22}\\.[a-zA-Z0-9_-]{43}", description: "SendGrid API keys" },
    { name: "Slack Bot", pattern: "xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}", description: "Slack bot tokens" },
    { name: "Slack User", pattern: "xoxp-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}", description: "Slack user tokens" },
    { name: "Supabase", pattern: "sbp_[a-zA-Z0-9]{40,}", description: "Supabase API keys" },
    { name: "Moltbook", pattern: "moltbook_sk_[a-zA-Z0-9_-]{20,}", description: "Moltbook API keys" },
    { name: "JWT Token", pattern: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\\.[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+", description: "JWT tokens" },
    { name: "Private Key", pattern: "-----BEGIN\\s+(RSA\\s+)?PRIVATE\\s+KEY-----", description: "PEM private keys" },
    { name: "Generic API Key", pattern: "api[_-]?key[_-]?[=:][\"']?[a-zA-Z0-9_-]{20,}[\"']?", description: "Generic API key patterns" },
  ];

  await client.insert({
    table: "api_key_patterns",
    values: defaultPatterns.map(p => ({ ...p, enabled: 1 })),
    format: "JSONEachRow",
  });
}
