/**
 * @hono/aurelia-ssr
 * 
 * Server-side rendering adapter for Aurelia 2 on Hono.
 * 
 * @example
 * ```typescript
 * import { renderAurelia, serializeState, createHtmlDocument } from '@hono/aurelia-ssr';
 * 
 * // In Hono route handler:
 * const html = await renderAurelia({
 *   component: DashboardPage,
 *   context: { user, workspace, role },
 * });
 * 
 * const payload = await serializeState(
 *   { user, workspace, role },
 *   { overview: data }
 * );
 * 
 * const document = createHtmlDocument(html, payload);
 * return c.html(document);
 * ```
 */

// Public API - Server-side
export { renderAurelia } from './render.js';
export { serializeState, validatePayload, stringifyPayload } from './serialize.js';
export {
  createHtmlDocument,
  createFallbackHtml,
  createErrorHtml,
  escapeHtml,
  escapeAttr,
  validateHtmlStructure,
} from './html.js';

// Public API - Route Adapter
export {
  aurelia,
  createAuthMiddleware,
  createAureliaRouteGroup,
} from './adapter.js';
export type { AuthMiddlewareConfig } from './adapter.js';

// Public API - Client-side
export {
  hydrateFromServer,
  isHydrationAvailable,
  peekHydrationPayload,
  clearHydration,
  HydrationCache,
  hydrationCache,
} from './hydrate.js';

// Types
export type {
  RenderContext,
  User,
  Workspace,
  HydrationPayload,
  RenderOptions,
  DocumentOptions,
  AureliaRouteConfig,
  HydrationOptions,
  HydrationResult,
} from './types.js';

// Version
export const VERSION = '1.0.0-alpha.1';
