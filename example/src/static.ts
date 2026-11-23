/**
 * Universal Static Asset Middleware for Bun & Cloudflare Workers
 *
 * Keeps router entrypoint (index.ts) 100% clean, declarative, and focused on application routes.
 */

import type { MiddlewareHandler } from 'hono';

export interface StaticAssetOptions {
  root?: URL;
  publicPrefix?: string;
  maxAge?: number;
}

export function staticAssets(options: StaticAssetOptions = {}): MiddlewareHandler {
  const prefix = options.publicPrefix ?? '/public';
  const maxAge = options.maxAge ?? 3600;

  return async (c, next) => {
    const env = c.env as { ASSETS?: { fetch: typeof fetch } } | undefined;
    const url = new URL(c.req.url);

    // 1. Cloudflare Workers ASSETS binding
    if (env?.ASSETS) {
      if (url.pathname.startsWith(prefix)) {
        const rewritten = new URL(c.req.url);
        rewritten.pathname = rewritten.pathname.replace(new RegExp(`^${prefix}`), '');
        const assetRes = await env.ASSETS.fetch(new Request(rewritten.toString(), {
          method: c.req.method,
          headers: c.req.raw.headers,
        }));
        if (assetRes.status !== 404) {
          return assetRes;
        }
      }
      if (/\.(css|js|map|json|ico|svg|woff2?|png|jpg)$/i.test(url.pathname)) {
        const assetRes = await env.ASSETS.fetch(c.req.raw);
        if (assetRes.status !== 404) {
          return assetRes;
        }
      }
    }

    // 2. Local Bun native zero-copy static asset serving
    // `import.meta.url` is only meaningful in the Bun/Node bundle. Resolving it
    // at module scope breaks Cloudflare Workers validation ("Invalid URL string"),
    // so keep it lazy and only touch it on the local runtime path.
    if (typeof Bun !== 'undefined') {
      const root = options.root ?? new URL('../public/', import.meta.url);
      const isPublic = url.pathname.startsWith(prefix);
      const isStaticExt = /\.(css|js|map|json|ico|svg|woff2?|png|jpg)$/i.test(url.pathname);
      if (isPublic || isStaticExt) {
        const subpath = isPublic ? url.pathname.slice(prefix.length).replace(/^\//, '') : url.pathname.slice(1);
        const file = Bun.file(new URL(subpath, root));
        if (await file.exists()) {
          return new Response(file, {
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
              'Cache-Control': `public, max-age=${maxAge}`,
            },
          });
        }
      }
    }

    return next();
  };
}
