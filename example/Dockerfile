# Multi-stage Bun build for Hono + Aurelia 2 SSR example

# Stage 1: Build
FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY package.json ./
COPY packages ./packages
COPY examples/fullstack-ssr ./examples/fullstack-ssr

RUN bun install

WORKDIR /app/examples/fullstack-ssr
RUN bun run build

# Stage 2: Runtime
FROM oven/bun:1-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/examples/fullstack-ssr ./examples/fullstack-ssr

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "const r = await fetch('http://localhost:' + (process.env.PORT || 3000) + '/health'); if (!r.ok) process.exit(1)" || exit 1

EXPOSE 3000

WORKDIR /app/examples/fullstack-ssr
CMD ["bun", "run", "start"]
