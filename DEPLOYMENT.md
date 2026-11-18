# Deployment Guide: @hono/aurelia

**Production deployment patterns for SSR apps built with @hono/aurelia**

---

## Overview

This guide covers deploying Hono + Aurelia SSR apps to various platforms.

Deployments split into two categories:
- **Serverless** (Vercel, Cloudflare, Netlify) — for low-latency static + API
- **Self-hosted** (Node.js, Docker) — for full control + scaling

---

## Vercel Deployment

### Why Vercel for Hono + Aurelia?

✅ Works out of the box  
✅ Automatic scaling  
✅ Edge middleware  
✅ Free tier available  

### Setup

1. **Create `vercel.json`:**

```json
{
  "buildCommand": "bun run build",
  "outputDirectory": "dist",
  "devCommand": "bun run dev",
  "regions": ["sfo1"]
}
```

2. **Build script in `package.json`:**

```json
{
  "scripts": {
    "build": "tsc && node dist/index.js --check"
  }
}
```

3. **Deploy:**

```bash
bun add -g vercel
vercel
```

### Production Config

**vercel.json (production-ready):**

```json
{
  "buildCommand": "bun install --frozen-lockfile && bun run build",
  "outputDirectory": "dist",
  "devCommand": "bun run dev",
  "regions": ["sfo1"],
  "env": {
    "NODE_ENV": "production",
    "PORT": "3000"
  },
  "functions": {
    "pages/api/*.ts": {
      "memory": 3008,
      "maxDuration": 60
    }
  }
}
```

### Environment Variables

Create `.env.production`:

```env
DATABASE_URL=postgresql://...
AUTH_SECRET=your-secret-key
HONO_ENV=production
```

Deploy via Vercel dashboard or CLI:

```bash
vercel env add DATABASE_URL
vercel env add AUTH_SECRET
vercel deploy --prod
```

---

## Cloudflare Workers

### Why Cloudflare for Hono?

✅ Edge computing  
✅ Ultra-low latency  
✅ Global by default  
✅ Free tier generous  

### Setup

1. **Install Wrangler:**

```bash
npm install -g wrangler
```

2. **Create `wrangler.toml`:**

```toml
name = "aurelia-ssr"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[env.production]
routes = [
  { pattern = "example.com/*", custom_domain = true }
]

[[env.production.bindings]]
binding = "DB"
type = "d1"
database_name = "aurora-db"

[[env.production.env_vars]]
DATABASE_URL = "d1://aurora-db"
```

3. **Build script:**

```json
{
  "scripts": {
    "build": "tsc",
    "deploy": "wrangler deploy --env production"
  }
}
```

4. **Deploy:**

```bash
wrangler deploy --env production
```

### TypeScript Config for Workers

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "WebWorker"],
    "module": "ES2020",
    "moduleResolution": "bundler"
  }
}
```

---

## Docker + Node.js

### Why Docker?

✅ Full control  
✅ Easy scaling  
✅ Works on any cloud  
✅ Local testing identical to production  

### Dockerfile

```dockerfile
# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build && bun install --production

# Runtime stage
FROM node:22-alpine
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .

ENV NODE_ENV=production
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@db:5432/app
      - AUTH_SECRET=${AUTH_SECRET}
    depends_on:
      - db
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=app
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### Build & Run

```bash
# Build image
docker build -t aurelia-ssr:1.0.0 .

# Run locally
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e AUTH_SECRET="secret" \
  aurelia-ssr:1.0.0

# Or with compose
docker-compose up --build
```

### Deploy to Cloud

**AWS EC2:**

```bash
aws ecr create-repository --repository-name aurelia-ssr
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
docker tag aurelia-ssr:1.0.0 123456789.dkr.ecr.us-east-1.amazonaws.com/aurelia-ssr:1.0.0
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/aurelia-ssr:1.0.0
```

**DigitalOcean App Platform:**

```yaml
# app.yaml
name: aurelia-ssr
services:
  - name: web
    github:
      repo: your-repo/aurelia-ssr
      branch: main
    build_command: bun run build
    run_command: node dist/index.js
    http_port: 3000
    envs:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        value: ${db.connection_string}
    health_check:
      http_path: /health

databases:
  - name: db
    engine: PG
    version: "16"
```

---

## Heroku Deployment

### Procfile

```
web: node dist/index.js
```

### Deploy

```bash
heroku create aurelia-ssr
heroku addons:create heroku-postgresql:standard-0
heroku config:set AUTH_SECRET=your-secret
git push heroku main
```

---

## Railway Deployment

### railway.json

```json
{
  "build": {
    "builder": "nixpacks",
    "buildCommand": "bun install && bun run build"
  },
  "deploy": {
    "restartPolicyType": "on_failure",
    "restartPolicyMaxRetries": 5
  }
}
```

### Deploy

```bash
npm install -g @railway/cli
railway init
railway up
```

---

## Production Checklist

Before deploying to production:

### Security
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS/TLS
- [ ] Configure CORS
- [ ] Add rate limiting
- [ ] Hash sensitive data
- [ ] Never commit `.env` files
- [ ] Use environment variables for secrets

### Performance
- [ ] Enable gzip compression
- [ ] Set up CDN for static assets
- [ ] Configure cache headers
- [ ] Monitor bundle size
- [ ] Set up error tracking (Sentry, etc.)

### Monitoring
- [ ] Health check endpoint (`/health`)
- [ ] Error logging
- [ ] Performance metrics
- [ ] Uptime monitoring
- [ ] Database backup strategy

### Database
- [ ] Regular backups
- [ ] Connection pooling
- [ ] Migration strategy
- [ ] Read replicas (if scaling)

### CI/CD
- [ ] Automated tests pass
- [ ] Type checking passes
- [ ] Linting passes
- [ ] Build succeeds
- [ ] Deploy automatically on merge

---

## Environment Variables

### Required

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Security
AUTH_SECRET=long-random-secret-key

# App
NODE_ENV=production
PORT=3000
```

### Optional

```env
# Logging
LOG_LEVEL=info

# Analytics
SENTRY_DSN=https://...

# Cache
REDIS_URL=redis://...

# Storage
S3_BUCKET=my-bucket
S3_REGION=us-east-1
```

---

## Performance Optimization

### Node.js Flags

```bash
# Enable clustering (use multiple CPU cores)
node --enable-source-maps dist/index.js

# Or with clustering:
node --enable-source-maps --experimental-worker dist/cluster.js
```

### Nginx Reverse Proxy

```nginx
upstream app {
  server localhost:3000;
  server localhost:3001;
  server localhost:3002;
}

server {
  listen 80;
  server_name example.com;

  # Compression
  gzip on;
  gzip_types text/plain text/css application/json;

  # Caching
  proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=app_cache:10m;

  location / {
    proxy_pass http://app;
    proxy_cache app_cache;
    proxy_cache_valid 200 1h;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # Healthcheck
  location /health {
    access_log off;
    proxy_pass http://app;
  }
}
```

### PM2 Process Manager

```yaml
# ecosystem.config.yml
apps:
  - name: aurelia-ssr
    script: ./dist/index.js
    instances: max
    exec_mode: cluster
    env:
      NODE_ENV: production
      PORT: 3000
    error_file: ./logs/error.log
    out_file: ./logs/out.log
    merge_logs: true
```

Run with:

```bash
pm2 start ecosystem.config.yml
pm2 logs
pm2 monit
```

---

## Monitoring & Logging

### Health Check Endpoint

```typescript
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV,
  });
});
```

### Error Tracking with Sentry

```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

app.onError((err, c) => {
  Sentry.captureException(err);
  return c.json(
    { error: 'Internal Server Error' },
    { status: 500 }
  );
});
```

### Structured Logging

```typescript
const logger = {
  info: (msg: string, data?: any) => {
    console.log(JSON.stringify({ level: 'info', msg, ...data }));
  },
  error: (msg: string, err?: Error, data?: any) => {
    console.error(JSON.stringify({
      level: 'error',
      msg,
      error: err?.message,
      stack: err?.stack,
      ...data
    }));
  }
};
```

---

## Scaling Strategy

### Stage 1: Single Instance
- ✅ Works for <1K concurrent users
- Start here

### Stage 2: Load Balanced
- Add Nginx/HAProxy
- Run 2-3 Node instances
- Shared session store (Redis)
- ✅ Works for <10K concurrent users

### Stage 3: Microservices
- Separate web server from API
- Independent scaling per service
- Message queue (RabbitMQ, Kafka)
- ✅ Works for <100K concurrent users

### Stage 4: Global Distribution
- Serverless edge functions (Vercel, Cloudflare)
- CDN for static assets
- ✅ Works for >100K concurrent users globally

---

## Cost Estimation

### Monthly costs at 100K DAU

| Platform | Compute | Database | Total |
|----------|---------|----------|-------|
| Vercel | $50-100 | $20-50 | $70-150 |
| Cloudflare | Free-10 | $20-50 | $20-60 |
| AWS EC2 | $40-80 | $30-60 | $70-140 |
| DigitalOcean | $40-80 | $25-50 | $65-130 |
| Railway | $30-60 | $20-40 | $50-100 |

**Cheapest:** Cloudflare + self-hosted Postgres  
**Easiest:** Vercel (includes everything)  
**Most Control:** AWS (most configuration)

---

## Troubleshooting

### App crashes on startup

```bash
# Check logs
docker logs aurelia-ssr

# Or with PM2
pm2 logs aurelia-ssr

# Common issues:
# - DATABASE_URL not set
# - AUTH_SECRET not set
# - Port already in use
```

### High memory usage

```typescript
// Check Node heap
node --max-old-space-size=512 dist/index.js

// Add memory monitoring
setInterval(() => {
  const mem = process.memoryUsage();
  console.log('Memory:', {
    rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB'
  });
}, 60000);
```

### Slow responses

```typescript
// Add request logging
app.use(async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  if (ms > 1000) {
    console.warn(`Slow request: ${c.req.path} (${ms}ms)`);
  }
});
```

---

## See Also

- [README.md](./README.md) — Library documentation
- [examples/fullstack-ssr/](../../examples/fullstack-ssr/) — Complete example
- [Hono deployment guide](https://hono.dev/guides/deploy)
