# Moltbook Scanner

A toolkit for scanning and browsing the [Moltbook](https://www.moltbook.com) social network for AI agents.

## Services

### Web (`web/`)
A Next.js web application for browsing the Moltbook feed, searching content, and exploring submolts.

**Features:**
- Browse posts sorted by hot/new/top/rising
- Semantic search (requires claimed account)
- View submolts (communities)
- Dark mode support

### Scanner (`scanner/`)
A Go service that continuously scans the Moltbook feed for exposed API keys and saves findings to ClickHouse.

**Detects:**
- OpenAI, Anthropic, Google API keys
- AWS credentials
- GitHub tokens
- Stripe, Slack, Discord, Telegram keys
- Supabase, Moltbook keys
- Generic API key patterns
- Private keys

## Quick Start

### Using Make (Recommended)

```bash
# Show all available commands
make help

# Start all services (ClickHouse, Scanner, Web)
make up

# Development mode (Web in dev, others in Docker)
make dev

# View logs
make logs

# Stop everything
make down
```

### Manual Setup

```bash
# Start all services with Docker
docker-compose up -d

# Or run individually:

# Web app (development)
cd web
npm install
npm run dev

# Scanner (requires ClickHouse running)
cd scanner
go run .
```

## Environment Variables

Create a `.env` file in the root directory:

```env
MOLTBOOK_API_KEY=moltbook_sk_xxx
CLICKHOUSE_PASSWORD=
POLL_INTERVAL=60s
```

Copy from the example:
```bash
cp .env.example .env
# Edit .env with your values
```

## Make Commands

| Command | Description |
|---------|-------------|
| `make up` | Start all services |
| `make down` | Stop all services |
| `make dev` | Web in dev mode + Docker services |
| `make dev-web` | Web in dev mode only |
| `make build` | Build all Docker images |
| `make logs` | Tail all logs |
| `make logs-scanner` | Tail scanner logs |
| `make db-query` | Open ClickHouse client |
| `make db-findings` | Show recent API key findings |
| `make clean` | Remove containers and images |

## Deploy to Railway

### Scanner Service
1. Create a new Railway project
2. Add a ClickHouse service (or use ClickHouse Cloud)
3. Add the scanner service from `scanner/`
4. Set environment variables:
   - `MOLTBOOK_API_KEY`
   - `CLICKHOUSE_HOST`
   - `CLICKHOUSE_PORT`
   - `CLICKHOUSE_DATABASE`
   - `CLICKHOUSE_USER`
   - `CLICKHOUSE_PASSWORD`
   - `POLL_INTERVAL`

### Web Service
1. Add the web service from `web/`
2. Railway will automatically detect the Dockerfile
3. No environment variables required (API key entered in browser)

## Project Structure

```
moltbook-scanner/
├── scanner/                  # Go API key scanner
│   ├── main.go
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── railway.toml
│   └── .env.example
├── web/                      # Next.js web app
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   └── lib/moltbook/     # Moltbook API client
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── railway.toml
│   └── .moltbot/skills/moltbook/  # Moltbook skill files
├── docker-compose.yml        # Root compose for all services
├── Makefile                  # Development commands
├── .env.example
└── README.md
```

## Moltbook API

The scanner uses the Moltbook API. See `web/.moltbot/skills/moltbook/SKILL.md` for full API documentation.

**Base URL:** `https://www.moltbook.com/api/v1`

## Database Schema

The scanner stores findings in ClickHouse:

```sql
-- API key findings
SELECT * FROM moltbook.api_key_findings ORDER BY found_at DESC LIMIT 10;

-- Statistics by key type
SELECT api_key_type, count() FROM moltbook.api_key_findings GROUP BY api_key_type;

-- Scanned posts count
SELECT count() FROM moltbook.scanned_posts;
```

## License

MIT
