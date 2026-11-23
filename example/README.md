# Hono + Aurelia SSR Example

A runnable reference implementation of `@hono/aurelia`: real Aurelia 2 components
rendered on the server, hydrated on the client, with idiomatic Hono middleware for
auth, static assets and JSON APIs.

> **Where this lives:** this is the `aurelia-ssr-example` workspace inside the
> monorepo (`packages/hono-aurelia/example`). It consumes `@hono/aurelia` through
> a `workspace:*` dependency, so build the package from the repo root first. It is
> kept separate from the production app in `apps/` on purpose — it demonstrates
> the framework packages, not the SaaS product.

### Live demo

This example is deployed as a Cloudflare Worker named **`aurelia-hono-ssr`** via
Wrangler:

**https://aurelia-hono-ssr.sandiko.workers.dev**

It was redeployed on **23 November 2026** from this directory. The home page,
`/health`, and the authenticated JSON endpoint were verified against the live
deployment. See [Deployment](#deployment) for the exact commands.

## Quick Start

From the **repo root**:

```bash
bun install
bun run --filter @hono/aurelia build
bun run --filter aurelia-ssr-example dev
```

Or from this directory once the root install has run:

```bash
cd packages/hono-aurelia/example
bun run dev
```

Then open **http://localhost:3000**.

`dev` builds the client bundle (`src/client.ts` → `public/client.js`) and starts
the Bun server in watch mode. Set `PORT` to change the port.

## Routes

| Route | Description |
|-------|-------------|
| `GET /` | Home page — public, server-rendered, hydrated |
| `GET /posts/:slug` | Post detail — public SSR (try `hono-aurelia-architecture`) |
| `POST /posts/:slug` | Post action, handled by `aureliaAction` |
| `GET /dashboard` | Protected dashboard — SSR, requires auth |
| `GET /api/posts` | JSON API, public |
| `GET /api/dashboard/stats` | JSON API, protected |
| `GET /health` | Health check |

## How SSR + Hydration Works

```
1. Browser requests GET /
2. An aurelia(HomePage) route renders the component to HTML on the server
3. The renderer appends an inert <script id="__AURELIA_SSR_DATA__"
   type="application/json"> carrying the XSS-escaped hydration payload
4. Browser receives complete HTML + payload; there is no duplicate API call
5. public/client.js runs createClientHydrator() from @hono/aurelia/client,
   which reads that script and attaches the Aurelia controllers to the DOM
```

The older `window.__HYDRATION__` global is **not** used; the payload is an HTML5
`application/json` script element.

## How Auth Works

A Hono middleware resolves the demo user from either the `token` query parameter
or an `Authorization: Bearer …` header. `demo-token` is the only accepted value.

```bash
# Without auth -> 401
curl http://localhost:3000/api/dashboard/stats

# With auth -> 200
curl 'http://localhost:3000/api/dashboard/stats?token=demo-token'
curl -H 'Authorization: Bearer demo-token' http://localhost:3000/api/dashboard/stats
```

This is intentionally a demo guard, not a real session system — see the
production API in `apps/api` for cookie-based sessions.

## Development

```bash
bun run dev          # watch mode (builds the client, then starts the server)
bun run typecheck    # tsc --noEmit --strict
bun run build        # client bundle + typecheck
bun test             # package tests
bun run lint         # oxlint
```

## Deployment

Three targets are wired up:

| Target | Command | Notes |
|--------|---------|-------|
| Native Bun / Node | `bun run build && PORT=3000 bun run start` | Default local server |
| Cloudflare Workers | `bun run deploy:worker` | Worker `aurelia-hono-ssr`, assets from `./public` |
| Container | `docker build -f packages/hono-aurelia/example/Dockerfile .` | Build from the **monorepo root** |

### Cloudflare Workers (live target)

`wrangler.toml` is the source of truth:

```toml
name = "aurelia-hono-ssr"
main = "dist/worker.js"
compatibility_date = "2026-11-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./public"
binding = "ASSETS"

[vars]
WORKER = "true"

[build]
command = "bun run build && bun run build:worker"
```

Because `[build].command` is set, `wrangler deploy` runs the client build and
the Worker build for you; the `deploy:worker` script is only a convenience
wrapper. If the Wrangler login has access to more than one Cloudflare account,
select the right one with `CLOUDFLARE_ACCOUNT_ID=… wrangler deploy` (the ID is
not stored in this repository).

```bash
cd packages/hono-aurelia/example

# Build without deploying (useful before a release)
bun run build
bun run build:worker        # → dist/worker.js

# Deploy / preview
bun run deploy:worker       # wrangler deploy
bun run preview:worker      # wrangler dev
```

`buildWorker()` from `@hono/aurelia/build` bundles `src/index.ts` for the edge:
it stubs `jsdom` so the LinkeDOM SSR path is used, sets `WORKER=true`, and
emits `dist/worker.js`. On Workers, `staticAssets()` serves files through the
`ASSETS` binding; the `import.meta.url` filesystem fallback is evaluated only
on the Bun path.

Verify the live deployment:

```bash
curl https://aurelia-hono-ssr.sandiko.workers.dev/health
curl https://aurelia-hono-ssr.sandiko.workers.dev/
curl 'https://aurelia-hono-ssr.sandiko.workers.dev/api/dashboard/stats?token=demo-token'
curl 'https://aurelia-hono-ssr.sandiko.workers.dev/api/dashboard/stats' # 401
```

## Environment Variables

```bash
PORT=3000                  # Server port (default: 3000)
NODE_ENV=production        # Disables the dev console banner
LOG_LEVEL=info             # Logging level
```

## Project Structure

```
src/
├── index.ts              # Hono app: middleware + routes
├── client.ts             # Browser entry: createClientHydrator()
├── data.ts               # Demo posts, dashboard stats, activity stream
├── static.ts             # Universal static-asset middleware
├── html.d.ts             # .html import typing for the bundler
└── pages/
    ├── home.{ts,html}
    ├── post-detail.{ts,html}
    └── dashboard.{ts,html}
public/                   # Generated client.js + style.css
test/fullstack-ssr.test.ts
wrangler.toml             # Cloudflare Worker config
Dockerfile, docker-compose.yml, .env.example
```

## Testing

```bash
curl http://localhost:3000/health
curl http://localhost:3000/
curl http://localhost:3000/posts/hono-aurelia-architecture
curl http://localhost:3000/api/dashboard/stats                    # 401
curl 'http://localhost:3000/api/dashboard/stats?token=demo-token' # 200

# Confirm the SSR payload script is present in the HTML
curl http://localhost:3000/ | grep '__AURELIA_SSR_DATA__'
```

## Troubleshooting

**Port already in use**

```bash
PORT=3001 bun run dev
```

**Module not found / stale build**

```bash
# From the repo root — workspace links are created by the root install
bun install
bun run --filter @hono/aurelia build
```

**`Invalid URL string` during `wrangler deploy`**

This happens when `staticAssets()` resolves `new URL('../public/', import.meta.url)`
at module scope and the bundle is validated by workerd. Keep the filesystem
fallback inside the `typeof Bun !== 'undefined'` branch so Workers only uses the
`ASSETS` binding. See `src/static.ts`.

**TypeScript errors**

```bash
bun run typecheck
```

## Learn More

- [Hono documentation](https://hono.dev)
- [Server-Side Rendering fundamentals](https://web.dev/rendering-on-the-web/)
- [`@hono/aurelia` package README](../README.md)
