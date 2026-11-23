# Multi-stage Bun build for the Hono + Aurelia 2 SSR example.
# Build from the MONOREPO ROOT so the workspace links and @hono/aurelia source
# are available: docker build -f packages/hono-aurelia/example/Dockerfile .

# Stage 1: Build
FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY packages ./packages

RUN bun install

WORKDIR /app/packages/hono-aurelia/example
RUN bun run build

# Stage 2: Runtime
FROM oven/bun:1-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "const r = await fetch('http://localhost:' + (process.env.PORT || 3000) + '/health'); if (!r.ok) process.exit(1)" || exit 1

EXPOSE 3000

WORKDIR /app/packages/hono-aurelia/example
CMD ["bun", "run", "start"]
