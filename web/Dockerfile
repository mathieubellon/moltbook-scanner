# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
# Support both standalone build (from web/) and monorepo build (from root)
COPY web/package.json web/package-lock.json* ./
RUN npm ci

# Copy source files
COPY web/ .

# Build the Next.js application
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
