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

// Public API
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
} from './types.js';

// Version
export const VERSION = '1.0.0-alpha.1';
