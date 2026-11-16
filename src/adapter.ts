/**
 * @hono/aurelia-ssr Route Adapter
 * 
 * High-level Hono middleware and route handler factory for Aurelia SSR.
 * Handles content negotiation, data loading, auth guards, and fallbacks.
 * 
 * @example
 * ```typescript
 * import { aurelia } from '@hono/aurelia-ssr';
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
import { renderAurelia } from './render.js';
import { serializeState } from './serialize.js';
import { createHtmlDocument, createErrorHtml, createFallbackHtml } from './html.js';
import type { AureliaRouteConfig, RenderContext } from './types.js';

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
 * Expects context to be set by auth middleware:
 * - c.get('user'): User object or null
 * - c.get('workspace'): Workspace object or null
 * - c.get('role'): Role string or null
 * 
 * @internal
 */
function extractRenderContext(c: Context): RenderContext {
  return {
    user: c.get('user') || null,
    workspace: c.get('workspace') || null,
    role: c.get('role') || null,
  };
}

/**
 * Execute data loaders in parallel
 * 
 * @internal
 */
async function executeLoaders(
  loaders: Record<string, (c: Context) => Promise<unknown>> | undefined,
  c: Context
): Promise<Record<string, unknown>> {
  if (!loaders || Object.keys(loaders).length === 0) {
    return {};
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
      data[result.value.key] = result.value.data;
    } else {
      // Log but don't fail — loaders are optional data enrichment
      console.warn('Loader error:', result.reason);
    }
  }

  return data;
}

/**
 * Aurelia route handler factory
 * 
 * Creates a Hono middleware function that:
 * 1. Checks authentication (if requiresAuth)
 * 2. Executes data loaders
 * 3. Renders Aurelia component on server
 * 4. Negotiates response format (HTML vs JSON)
 * 5. Returns HTML document or JSON payload
 * 
 * @param config - Route configuration
 * @returns Hono middleware function
 * 
 * @example
 * ```typescript
 * // HTML response (default)
 * app.get('/dashboard', aurelia({
 *   component: DashboardPage,
 *   title: 'Dashboard',
 *   requiresAuth: true,
 *   loaders: {
 *     stats: async (c) => fetch('/api/stats').then(r => r.json())
 *   }
 * }));
 * 
 * // JSON response (for API consumers)
 * // GET /dashboard with Accept: application/json
 * // Returns: { context, initialData, timestamp, component }
 * ```
 */
export function aurelia(config: AureliaRouteConfig) {
  return async (c: Context) => {
    try {
      // === PHASE 1: AUTH GUARD ===
      const context = extractRenderContext(c);
      const isAuthenticated = context.user !== null;

      if (config.requiresAuth && !isAuthenticated) {
        return c.json(
          { error: 'Unauthorized', message: 'This page requires authentication' },
          { status: 401 }
        );
      }

      // === PHASE 2: CONTENT NEGOTIATION ===
      const acceptHeader = c.req.header('Accept');
      const { preferredType, isHtml, isJson } = negotiateContent(acceptHeader);

      // === PHASE 3: DATA LOADING ===
      let initialData: Record<string, unknown> = {};
      
      if (config.loaders) {
        try {
          initialData = await executeLoaders(config.loaders, c);
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

      const componentName =
        (typeof config.component === 'function' || (typeof config.component === 'object' && config.component !== null)) &&
        'name' in config.component &&
        typeof (config.component as { name?: unknown }).name === 'string' &&
        (config.component as { name: string }).name
          ? (config.component as { name: string }).name
          : 'Page';

      // === PHASE 4: JSON RESPONSE ===
      if (preferredType === 'json' && isJson) {
        return c.json({
          component: componentName,
          context: {
            ...context,
            isAuthenticated,
          },
          initialData,
          timestamp: Date.now(),
        });
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
        
        if (config.fallback === 'spa') {
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
      if (config.streaming) {
        const marker = '<!--__SSR_STREAM_SPLIT__-->';
        const templateDoc = createHtmlDocument(marker, payload, {
          title: config.title,
          ...config.document,
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
        return c.body(stream, 200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        });
      }

      // Standard buffered HTML document
      const document = createHtmlDocument(html, payload, {
        title: config.title,
        ...config.document,
      });

      return c.html(document);

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

/**
 * Extract auth context from request headers or cookies
 * 
 * Useful middleware factory for setting up c.get('user'), etc.
 * 
 * @example
 * ```typescript
 * app.use(createAuthMiddleware({
 *   getUserFromToken: async (token) => {
 *     return await db.users.findByToken(token);
 *   }
 * }));
 * ```
 */
export interface AuthMiddlewareConfig {
  getUserFromToken?: (token: string) => Promise<unknown>;
  getWorkspaceFromRequest?: (c: Context) => Promise<unknown>;
  getRoleForUser?: (user: unknown, workspace: unknown) => string | null;
}

/**
 * Create auth middleware for extracting and setting render context
 * 
 * @internal This is optional — developers can implement their own auth
 */
export function createAuthMiddleware(config: AuthMiddlewareConfig) {
  return async (c: Context, next: () => Promise<void>) => {
    // Extract token from Authorization header, query parameter, or cookie
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '') || c.req.query('token');

    let user: unknown = null;
    let workspace: unknown = null;
    let role: string | null = null;

    // Load user from token
    if (token && config.getUserFromToken) {
      try {
        user = await config.getUserFromToken(token);
      } catch (error) {
        console.error('Failed to load user from token:', error);
      }
    }

    // Load workspace
    if (config.getWorkspaceFromRequest) {
      try {
        workspace = await config.getWorkspaceFromRequest(c);
      } catch (error) {
        console.error('Failed to load workspace:', error);
      }
    }

    // Determine role
    if (user && workspace && config.getRoleForUser) {
      try {
        role = config.getRoleForUser(user, workspace);
      } catch (error) {
        console.error('Failed to determine role:', error);
      }
    }

    // Set context
    c.set('user', user);
    c.set('workspace', workspace);
    c.set('role', role);

    await next();
  };
}

/**
 * Utility: Create a route group with shared config
 * 
 * @example
 * ```typescript
 * const protectedRoutes = createAureliaRouteGroup({
 *   requiresAuth: true,
 *   loaders: { user: async (c) => c.get('user') }
 * });
 * 
 * app.get('/profile', protectedRoutes.handler(ProfilePage, 'Profile'));
 * app.get('/settings', protectedRoutes.handler(SettingsPage, 'Settings'));
 * ```
 */
export function createAureliaRouteGroup(defaults: Partial<AureliaRouteConfig>) {
  return {
    handler: (component: unknown, title: string, overrides?: Partial<AureliaRouteConfig>) => {
      return aurelia({
        ...defaults,
        component,
        title,
        ...overrides,
      } as AureliaRouteConfig);
    },
  };
}
