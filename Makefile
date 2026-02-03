# Moltbook Scanner - Makefile for OrbStack/Docker local development

.PHONY: help build build-scanner build-web up down logs logs-scanner logs-web \
        dev dev-web dev-scanner clean clean-all restart restart-scanner restart-web \
        shell-scanner shell-web shell-clickhouse db-query test-scanner

# Default target
help:
	@echo "Moltbook Scanner - Local Development Commands"
	@echo ""
	@echo "Build:"
	@echo "  make build          - Build all Docker images"
	@echo "  make build-scanner  - Build scanner image only"
	@echo "  make build-web      - Build web image only"
	@echo ""
	@echo "Run (Docker):"
	@echo "  make up             - Start all services (ClickHouse, Tabix, Scanner, Web)"
	@echo "  make down           - Stop all services"
	@echo "  make restart        - Restart all services"
	@echo "  make restart-scanner- Restart scanner only"
	@echo "  make restart-web    - Restart web only"
	@echo ""
	@echo "Development (local):"
	@echo "  make dev            - Run web in dev mode + ClickHouse + Scanner"
	@echo "  make dev-web        - Run web in dev mode only"
	@echo "  make dev-scanner    - Run scanner locally (needs ClickHouse)"
	@echo ""
	@echo "Logs:"
	@echo "  make logs           - Tail logs for all services"
	@echo "  make logs-scanner   - Tail scanner logs"
	@echo "  make logs-web       - Tail web logs"
	@echo ""
	@echo "Shell access:"
	@echo "  make shell-scanner  - Shell into scanner container"
	@echo "  make shell-web      - Shell into web container"
	@echo "  make shell-clickhouse - Shell into ClickHouse container"
	@echo ""
	@echo "Database:"
	@echo "  make db-ui          - Open Tabix (ClickHouse Web UI) info"
	@echo "  make db-query       - Open ClickHouse client"
	@echo "  make db-findings    - Show recent API key findings"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean          - Stop containers and remove images"
	@echo "  make clean-all      - Clean everything including volumes"

# =============================================================================
# Build
# =============================================================================

build: build-scanner build-web
	@echo "✅ All images built"

build-scanner:
	@echo "🔨 Building scanner image..."
	docker build -t moltbook-scanner:latest ./scanner

build-web:
	@echo "🔨 Building web image..."
	docker build -t moltbook-web:latest ./web

# =============================================================================
# Docker Compose - Run
# =============================================================================

up:
	@echo "🚀 Starting all services..."
	docker compose up -d
	@echo "✅ Services started"
	@echo "   Web: http://localhost:3000"
	@echo "   Tabix (DB UI): http://localhost:8080"
	@echo "   ClickHouse HTTP: http://localhost:8123"

down:
	@echo "🛑 Stopping all services..."
	docker compose down

restart: down up

restart-scanner:
	@echo "🔄 Restarting scanner..."
	docker compose restart scanner

restart-web:
	@echo "🔄 Restarting web..."
	docker compose restart web

# =============================================================================
# Development - Local
# =============================================================================

dev: 
	@echo "🚀 Starting ClickHouse and Scanner in Docker, Web in dev mode..."
	docker compose up -d clickhouse scanner
	@echo "⏳ Waiting for ClickHouse to be ready..."
	@sleep 5
	cd web && npm run dev

dev-web:
	@echo "🚀 Starting web in dev mode..."
	cd web && npm run dev

dev-scanner:
	@echo "🚀 Starting scanner locally..."
	@echo "⚠️  Make sure ClickHouse is running (make up-clickhouse)"
	cd scanner && go run .

up-clickhouse:
	@echo "🚀 Starting ClickHouse only..."
	docker compose up -d clickhouse
	@echo "⏳ Waiting for ClickHouse to be ready..."
	@sleep 5
	@echo "✅ ClickHouse ready at localhost:9000 (native) / localhost:8123 (HTTP)"

# =============================================================================
# Logs
# =============================================================================

logs:
	docker compose logs -f

logs-scanner:
	docker compose logs -f scanner

logs-web:
	docker compose logs -f web

logs-clickhouse:
	docker compose logs -f clickhouse

# =============================================================================
# Shell access
# =============================================================================

shell-scanner:
	docker compose exec scanner sh

shell-web:
	docker compose exec web sh

shell-clickhouse:
	docker compose exec clickhouse bash

# =============================================================================
# Database
# =============================================================================

db-ui:
	@echo "📊 Tabix - ClickHouse Web UI"
	@echo "   URL: http://localhost:8080"
	@echo ""
	@echo "   Connection settings:"
	@echo "   - Host: http://clickhouse:8123 (or http://host.docker.internal:8123)"
	@echo "   - User: default"
	@echo "   - Password: (empty or from CLICKHOUSE_PASSWORD)"
	@echo "   - Database: moltbook"

db-query:
	@echo "📊 Opening ClickHouse client..."
	docker compose exec clickhouse clickhouse-client -d moltbook

db-findings:
	@echo "📊 Recent API key findings:"
	docker compose exec clickhouse clickhouse-client -d moltbook \
		--query "SELECT found_at, api_key_type, api_key, post_title, author_name FROM api_key_findings ORDER BY found_at DESC LIMIT 20 FORMAT Pretty"

db-stats:
	@echo "📊 Scanner statistics:"
	docker compose exec clickhouse clickhouse-client -d moltbook \
		--query "SELECT api_key_type, count() as count FROM api_key_findings GROUP BY api_key_type ORDER BY count DESC FORMAT Pretty"
	@echo ""
	@echo "Total scanned posts:"
	docker compose exec clickhouse clickhouse-client -d moltbook \
		--query "SELECT count() FROM scanned_posts FORMAT Pretty"

# =============================================================================
# Testing
# =============================================================================

test-scanner:
	@echo "🧪 Running scanner tests..."
	cd scanner && go test -v ./...

test-web:
	@echo "🧪 Running web tests..."
	cd web && npm test

lint-web:
	@echo "🔍 Linting web..."
	cd web && npm run lint

# =============================================================================
# Cleanup
# =============================================================================

clean:
	@echo "🧹 Cleaning up containers and images..."
	docker compose down --rmi local
	@echo "✅ Cleanup complete"

clean-all:
	@echo "🧹 Cleaning everything including volumes..."
	docker compose down --rmi local -v
	@echo "✅ Full cleanup complete"

clean-scanner:
	@echo "🧹 Cleaning scanner binary..."
	rm -f scanner/scanner

# =============================================================================
# Installation helpers
# =============================================================================

install-web:
	@echo "📦 Installing web dependencies..."
	cd web && npm install

install-scanner:
	@echo "📦 Downloading Go dependencies..."
	cd scanner && go mod download

install: install-web install-scanner
	@echo "✅ All dependencies installed"

# =============================================================================
# Production builds
# =============================================================================

prod-build-scanner:
	@echo "🔨 Building scanner for production..."
	cd scanner && CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o scanner .

prod-build-web:
	@echo "🔨 Building web for production..."
	cd web && npm run build
