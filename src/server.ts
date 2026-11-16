export { renderAurelia } from './render.js';
export { IRequestContext } from './tokens.js';
export { serializeState, validatePayload, stringifyPayload } from './serialize.js';
export {
  createHtmlDocument,
  createFallbackHtml,
  createErrorHtml,
  escapeHtml,
  escapeAttr,
  validateHtmlStructure,
} from './html.js';
export {
  aurelia,
  createAuthMiddleware,
  createAureliaRouteGroup,
} from './adapter.js';
export type { AuthMiddlewareConfig } from './adapter.js';
export type {
  RenderContext,
  User,
  Workspace,
  HydrationPayload,
  RenderOptions,
  DocumentOptions,
  AureliaRouteConfig,
} from './types.js';
