/**
 * @hono/aurelia Route Adapter
 * 
 * High-level Hono middleware and route handler factory for Aurelia SSR.
 * Handles content negotiation, data loading, auth guards, and fallbacks.
 * 
 * @example
 * ```typescript
 * import { aurelia } from '@hono/aurelia';
 * import { DashboardPage } from './pages';
 * 
 * app.get('/dashboard', 
 *   aurelia({
 *     component: DashboardPage,
 *     title: 'Dashboard',
 *     requiresAuth: true,
 *     loaders: {
 *       overview: async (c) => {
 *         const res = await fetch(`${API_URL}/overview`);
 *         return res.json();
 *       }
 *     }
 *   })
 * );
 * ```
 */

import type { Context } from 'hono';
import { resolve as pathResolve, normalize as pathNormalize } from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { CustomElement } from 'aurelia';
import {
  renderAurelia,
  serializeState,
  createHtmlDocument,
  createErrorHtml,
  createFallbackHtml,
  type RenderContext,
} from '@aureliajs/ssr';
import type {
  AureliaRouteConfig,
  AureliaDefaultsOptions,
  ServeAssetsOptions,
} from './types.js';

let globalAureliaDefaults: AureliaDefaultsOptions = {};

/**
 * Configure global defaults for all aurelia() route handlers in the application.
 */
export function setAureliaDefaults(defaults: AureliaDefaultsOptions): void {
  globalAureliaDefaults = { ...globalAureliaDefaults, ...defaults };
}

/**
 * Middleware that provides router-scoped defaults (e.g. document bundle paths, streaming)
 * to all child aurelia() route handlers.
 *
 * @example
 * ```typescript
 * app.use('*', aureliaDefaults({
 *   document: { cssBundle: '/public/style.css', jsBundle: '/public/client.js' },
 *   streaming: true,
 * }));
 * ```
 */
export function aureliaDefaults(defaults: AureliaDefaultsOptions) {
  return async (c: Context, next: () => Promise<void>) => {
    c.set('__aurelia_defaults', defaults);
    await next();
  };
}

const MIME_MAP: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

/**
 * Ergonomic static asset middleware for Aurelia client bundles and assets.
 * Eliminates 20+ lines of readFileSync and MIME detection boilerplate.
 *
 * @example
 * ```typescript
 * app.use('/public/*', serveAureliaAssets({ root: './public' }));
 * ```
 */
export function serveAureliaAssets(options: ServeAssetsOptions) {
  const rootDir = pathResolve(options.root);
  const prefix = options.prefix ?? '/public';
  const maxAge = options.maxAge ?? 86400;

  return async (c: Context, next: () => Promise<void>) => {
    const urlPath = c.req.path;
    if (!urlPath.startsWith(prefix)) {
      return next();
    }

    const relPath = urlPath.slice(prefix.length).replace(/^\/+/, '');
    const safePath = pathNormalize(pathResolve(rootDir, relPath));

    // Prevent directory traversal attacks
    if (!safePath.startsWith(rootDir)) {
      return c.text('Forbidden', 403);
    }

    // Zero-copy kernel streaming via Bun.file when running on Bun
    if (typeof (globalThis as unknown as { Bun?: { file: (p: string) => { exists: () => Promise<boolean> } } }).Bun !== 'undefined') {
      const bunFile = (globalThis as unknown as { Bun: { file: (p: string) => { exists: () => Promise<boolean> } } }).Bun.file(safePath);
      if (await bunFile.exists()) {
        const dotIdx = safePath.lastIndexOf('.');
        const ext = dotIdx !== -1 ? safePath.slice(dotIdx).toLowerCase() : '';
        const contentType = MIME_MAP[ext] ?? 'application/octet-stream';
        return new Response(bunFile as unknown as BodyInit, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': `public, max-age=${maxAge}`,
          },
        });
      }
      return next();
    }

    if (!existsSync(safePath)) {
      return next();
    }

    try {
      const stat = statSync(safePath);
      if (!stat.isFile()) {
        return next();
      }

      const dotIdx = safePath.lastIndexOf('.');
      const ext = dotIdx !== -1 ? safePath.slice(dotIdx).toLowerCase() : '';
      const contentType = MIME_MAP[ext] ?? 'application/octet-stream';
      const content = readFileSync(safePath);

      return c.body(content, 200, {
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${maxAge}`,
        'Content-Length': stat.size.toString(),
      });
    } catch {
      return next();
    }
  };
}

/**
 * Content negotiation result
 */
interface ContentNegotiation {
  isHtml: boolean;
  isJson: boolean;
  preferredType: 'html' | 'json';
}

/**
 * Analyze Accept header to determine response format
 * 
 * @param acceptHeader - HTTP Accept header value
 * @returns Content negotiation preference
 * 
 * @internal
 */
function negotiateContent(acceptHeader?: string): ContentNegotiation {
  if (!acceptHeader) {
    return { isHtml: true, isJson: false, preferredType: 'html' };
  }

  const hasJson = acceptHeader.includes('application/json');
  const hasHtml = acceptHeader.includes('text/html');
  const hasWildcard = acceptHeader.includes('*/*');

  // Prioritize based on q-values and specificity
  const jsonQValue = extractQValue(acceptHeader, 'application/json');
  const htmlQValue = extractQValue(acceptHeader, 'text/html');
  const wildcardQValue = extractQValue(acceptHeader, '*/*');

  const jsonPriority = hasJson ? jsonQValue : (hasWildcard ? wildcardQValue : 0);
  const htmlPriority = hasHtml ? htmlQValue : (hasWildcard ? wildcardQValue : 0.1);

  const preferredType = jsonPriority > htmlPriority ? 'json' : 'html';

  return {
    isHtml: hasHtml || hasWildcard,
    isJson: hasJson || hasWildcard,
    preferredType,
  };
}

/**
 * Extract q-value (quality factor) from Accept header
 * 
 * @internal
 */
function extractQValue(acceptHeader: string, mimeType: string): number {
  // Escape special regex characters in MIME type
  const escapedMimeType = mimeType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escapedMimeType}(?:;\\s*q=([0-9.]+))?`, 'i');
  const match = acceptHeader.match(regex);
  
  if (!match) return 0;
  if (!match[1]) return 1; // Default q-value is 1
  
  const qValue = parseFloat(match[1]);
  return isNaN(qValue) ? 0 : Math.min(Math.max(qValue, 0), 1);
}

/**
 * Extract render context from Hono context
 * 
 * Returns all request-scoped context variables from c.var without imposing
 * rigid schema constraints.
 * 
 * @internal
 */
function extractRenderContext(c: Context): RenderContext {
  return (c.var as RenderContext) || {};
}

/**
 * Execute data loaders in parallel
 * 
 * @internal
 */
async function executeLoaders(
  loaders: Record<string, (c: Context) => Promise<unknown | Response>> | undefined,
  c: Context
): Promise<{ data: Record<string, unknown>; response?: Response }> {
  if (!loaders || Object.keys(loaders).length === 0) {
    return { data: {} };
  }

  const results = await Promise.allSettled(
    Object.entries(loaders).map(async ([key, loader]) => {
      try {
        const data = await loader(c);
        return { key, data };
      } catch (error) {
        console.error(`Loader failed for key "${key}":`, error);
        throw error;
      }
    })
  );

  const data: Record<string, unknown> = {};
  
  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value.data instanceof Response) {
        return { data: {}, response: result.value.data };
      }
      data[result.value.key] = result.value.data;
    } else {
      // Log but don't fail — loaders are optional data enrichment
      console.warn('Loader error:', result.reason);
    }
  }

  return { data };
}

/**
 * Aurelia route handler factory
 * 
 * Creates a Hono middleware function that:
 * 1. Checks authentication (if requiresAuth)
 * 2. Executes co-located or configured data loaders
 * 3. Renders Aurelia component on server
 * 4. Negotiates response format (HTML vs JSON)
 * 5. Returns HTML document or JSON payload
 * 
 * Supports both full configuration object and ergonomic shorthand:
 * ```typescript
 * // Shorthand with co-located loaders and optional title
 * app.get('/posts/:slug', aurelia(PostDetailPage, 'Post Detail'));
 * 
 * // Full configuration object
 * app.get('/dashboard', aurelia({
 *   component: DashboardPage,
 *   title: 'Dashboard',
 *   requiresAuth: true,
 *   loaders: {
 *     stats: async (c) => fetch('/api/stats').then(r => r.json())
 *   }
 * }));
 * ```
 */
export function aurelia(
  config: AureliaRouteConfig
): (c: Context) => Promise<Response>;
export function aurelia(
  component: unknown,
  title?: string | ((data: Record<string, unknown>, c: Context) => string)
): (c: Context) => Promise<Response>;
export function aurelia(
  configOrComponent: AureliaRouteConfig | unknown,
  maybeTitle?: string | ((data: Record<string, unknown>, c: Context) => string)
): (c: Context) => Promise<Response> {
  // Normalize config
  let config: AureliaRouteConfig;
  const isPlainConfig =
    Boolean(configOrComponent) &&
    typeof configOrComponent === 'object' &&
    'component' in (configOrComponent as Record<string, unknown>);

  if (isPlainConfig) {
    config = { ...(configOrComponent as AureliaRouteConfig) };
  } else {
    config = {
      component: configOrComponent,
      title: maybeTitle,
    };
  }

  const comp = config.component as (Record<string, unknown> & { name?: string }) | null | undefined;

  // Infer title from static component property if omitted
  if (!config.title && comp) {
    if (typeof comp.title === 'string' || typeof comp.title === 'function') {
      config.title = comp.title as any;
    } else if (typeof comp.name === 'string' && comp.name) {
      config.title = comp.name;
    } else {
      config.title = 'Aurelia App';
    }
  } else if (!config.title) {
    config.title = 'Aurelia App';
  }

  // Infer requiresAuth from static component property if omitted
  if (config.requiresAuth === undefined && comp && typeof comp.requiresAuth === 'boolean') {
    config.requiresAuth = comp.requiresAuth;
  }

  // Infer authGuard and onUnauthorized from component if omitted
  if (config.authGuard === undefined && comp && typeof comp.authGuard === 'function') {
    config.authGuard = comp.authGuard as AureliaRouteConfig['authGuard'];
  }
  if (config.onUnauthorized === undefined && comp && typeof comp.onUnauthorized === 'function') {
    config.onUnauthorized = comp.onUnauthorized as AureliaRouteConfig['onUnauthorized'];
  }

  // Infer fallback from static component property if omitted
  if (config.fallback === undefined && comp && (comp.fallback === 'spa' || comp.fallback === 'error')) {
    config.fallback = comp.fallback as 'spa' | 'error';
  }

  return async (c: Context) => {
    try {
      // === PHASE 0: DEFAULTS RESOLUTION ===
      const contextDefaults = c.get('__aurelia_defaults') as AureliaDefaultsOptions | undefined;
      const effectiveStreaming =
        config.streaming ?? contextDefaults?.streaming ?? globalAureliaDefaults.streaming ?? false;
      const effectiveDocument = {
        ...globalAureliaDefaults.document,
        ...contextDefaults?.document,
        ...config.document,
      };
      const effectiveFallback =
        config.fallback ?? contextDefaults?.fallback ?? globalAureliaDefaults.fallback ?? 'error';

      // === PHASE 1: AUTH GUARD ===
      const context = extractRenderContext(c);
      const ctxRecord = context as Record<string, unknown>;

      if (config.requiresAuth) {
        let isAuthorized = false;
        const customGuard =
          config.authGuard ?? contextDefaults?.authGuard ?? globalAureliaDefaults.authGuard;
        if (typeof customGuard === 'function') {
          const guardResult = await customGuard(c);
          if (guardResult instanceof Response) {
            return guardResult;
          }
          isAuthorized = Boolean(guardResult);
        } else {
          isAuthorized = Boolean(
            c.get('user') || c.get('auth') || c.get('session') || c.get('jwtPayload') || ctxRecord.user
          );
        }

        if (!isAuthorized) {
          const customUnauthorized =
            config.onUnauthorized ?? contextDefaults?.onUnauthorized ?? globalAureliaDefaults.onUnauthorized;
          if (typeof customUnauthorized === 'function') {
            return await customUnauthorized(c);
          }
          return c.json(
            { error: 'Unauthorized', message: 'This page requires authentication' },
            { status: 401 }
          );
        }
      }

      // === PHASE 1.5: CO-LOCATED ACTIONS & MUTATIONS (POST/PUT/PATCH/DELETE) ===
      if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
        let actionName = c.req.query('_action') || c.req.query('action') || c.req.header('X-Action');

        const contentType = c.req.header('Content-Type') || '';
        if (!actionName) {
          if (contentType.includes('application/json')) {
            const body = await c.req.json().catch(() => null);
            if (body && typeof body._action === 'string') {
              actionName = body._action;
            } else if (body && typeof body.action === 'string') {
              actionName = body.action;
            }
          } else if (
            contentType.includes('application/x-www-form-urlencoded') ||
            contentType.includes('multipart/form-data')
          ) {
            const formData = (await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>;
            if (typeof formData._action === 'string') {
              actionName = formData._action;
            } else if (typeof formData.action === 'string') {
              actionName = formData.action;
            }
          }
        }

        const effectiveActionName = actionName || 'default';
        const actionsMap = (config.actions || comp?.actions) as
          | Record<string, (c: Context) => Promise<unknown>>
          | undefined;
        let actionHandler = actionsMap?.[effectiveActionName];

        if (!actionHandler && effectiveActionName === 'default') {
          if (typeof config.action === 'function') {
            actionHandler = config.action;
          } else if (typeof comp?.action === 'function') {
            actionHandler = comp.action as (c: Context) => Promise<unknown>;
          }
        }

        if (!actionHandler) {
          if (actionsMap && Object.keys(actionsMap).length > 0) {
            return c.json({ error: `Action "${effectiveActionName}" not found` }, 404);
          }
          return c.text('Method Not Allowed', { status: 405 });
        }

        const actionResult = await actionHandler(c);

        if (actionResult instanceof Response) {
          return actionResult;
        }

        return c.json(actionResult !== undefined ? actionResult : { success: true });
      }

      // === PHASE 2: CONTENT NEGOTIATION ===
      const acceptHeader = c.req.header('Accept');
      const { preferredType, isHtml, isJson } = negotiateContent(acceptHeader);

      // === PHASE 3: DATA LOADING ===
      let initialData: Record<string, unknown> = {};

      // 1. Co-located static loaders on component class
      if (comp) {
        if (typeof comp.loader === 'function') {
          try {
            const result = await (comp.loader as (c: Context) => Promise<unknown>)(c);
            if (result instanceof Response) {
              return result;
            }
            if (result && typeof result === 'object') {
              Object.assign(initialData, result);
            }
          } catch (error) {
            console.error('Co-located loader failed:', error);
            if (config.fallback === 'error') {
              return c.html(
                createErrorHtml(500, 'Failed to load page data', 'Please try refreshing the page'),
                { status: 500 }
              );
            }
          }
        }
        if (comp.loaders && typeof comp.loaders === 'object') {
          try {
            const res = await executeLoaders(comp.loaders as Record<string, (c: Context) => Promise<unknown | Response>>, c);
            if (res.response) {
              return res.response;
            }
            Object.assign(initialData, res.data);
          } catch (error) {
            console.error('Co-located loaders failed:', error);
            if (config.fallback === 'error') {
              return c.html(
                createErrorHtml(500, 'Failed to load page data', 'Please try refreshing the page'),
                { status: 500 }
              );
            }
          }
        }
      }

      // 2. Explicit config.loaders overrides/augments co-located loaders
      if (config.loaders) {
        try {
          const res = await executeLoaders(config.loaders, c);
          if (res.response) {
            return res.response;
          }
          Object.assign(initialData, res.data);
        } catch (error) {
          // If loaders fail, decide based on fallback strategy
          if (config.fallback === 'error') {
            console.error('Data loading failed:', error);
            return c.html(
              createErrorHtml(
                500,
                'Failed to load page data',
                'Please try refreshing the page'
              ),
              { status: 500 }
            );
          }
          // Otherwise, continue with empty data (loaders are optional)
        }
      }

      let componentName = 'Page';
      if (comp) {
        try {
          if (CustomElement.isType(comp as any)) {
            componentName = CustomElement.getDefinition(comp as any).name;
          } else if (typeof comp.name === 'string' && comp.name) {
            componentName = comp.name;
          } else if (typeof config.component === 'function' && config.component.name) {
            componentName = config.component.name;
          }
        } catch {
          if (typeof comp.name === 'string' && comp.name) {
            componentName = comp.name;
          }
        }
      }

      // Dynamic title resolution
      let effectiveTitle = 'Aurelia App';
      const titleCandidate = config.title ?? comp?.title ?? comp?.name;
      if (typeof titleCandidate === 'function') {
        try {
          effectiveTitle = (titleCandidate as (d: Record<string, unknown>, c: Context) => string)(initialData, c) || 'Aurelia App';
        } catch {
          effectiveTitle = 'Aurelia App';
        }
      } else if (typeof titleCandidate === 'string' && titleCandidate) {
        effectiveTitle = titleCandidate;
      }

      // Dynamic HTTP status resolution
      let effectiveStatus = 200;
      if (typeof config.status === 'function') {
        effectiveStatus = config.status(initialData, c);
      } else if (typeof config.status === 'number') {
        effectiveStatus = config.status;
      } else if (typeof comp?.status === 'function') {
        effectiveStatus = (comp.status as (d: Record<string, unknown>, c: Context) => number)(initialData, c);
      } else if (typeof comp?.status === 'number') {
        effectiveStatus = comp.status;
      } else if (c.res && c.res.status && c.res.status !== 200) {
        effectiveStatus = c.res.status;
      }

      // === PHASE 4: JSON RESPONSE ===
      if (preferredType === 'json' && isJson) {
        return c.json({
          component: componentName,
          title: effectiveTitle,
          context,
          initialData,
          timestamp: Date.now(),
        }, effectiveStatus as any);
      }

      // === PHASE 5: HTML RESPONSE ===
      if (!isHtml && !isJson) {
        // Client doesn't accept HTML or JSON
        return c.text('Not Acceptable', { status: 406 });
      }

      // Render component on server with full request parameters
      let html: string;
      try {
        html = await renderAurelia({
          component: config.component,
          context,
          props: initialData,
          url: c.req.url,
          params: c.req.param(),
          query: c.req.query(),
        });
      } catch (error) {
        console.error('Rendering failed:', error);
        
        if (effectiveFallback === 'spa') {
          // Return empty shell for client-side rendering
          html = createFallbackHtml();
        } else {
          // Return error page
          return c.html(
            createErrorHtml(
              500,
              'Failed to render page',
              'An unexpected error occurred'
            ),
            { status: 500 }
          );
        }
      }

      // Serialize state for client hydration
      const payload = await serializeState(
        context,
        initialData,
        componentName
      );

      // Streaming response mode for near-zero TTFB
      if (effectiveStreaming) {
        const marker = '<!--__SSR_STREAM_SPLIT__-->';
        const templateDoc = createHtmlDocument(marker, payload, {
          title: effectiveTitle,
          ...effectiveDocument,
        });
        const [preamble, postamble] = templateDoc.split(marker);
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(preamble ?? ''));
            controller.enqueue(encoder.encode(html));
            controller.enqueue(encoder.encode(postamble ?? ''));
            controller.close();
          },
        });
        return c.body(stream, effectiveStatus as any, {
          'Content-Type': 'text/html; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        });
      }

      // Standard buffered HTML document
      const document = createHtmlDocument(html, payload, {
        title: effectiveTitle,
        ...effectiveDocument,
      });

      return c.html(document, effectiveStatus as any);

    } catch (error) {
      console.error('Route handler error:', error);
      return c.html(
        createErrorHtml(
          500,
          'Internal Server Error',
          'Something went wrong processing your request'
        ),
        { status: 500 }
      );
    }
  };
}
