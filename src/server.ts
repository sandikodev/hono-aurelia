/**
 * @hono/aurelia-ssr Server Entrypoint
 */
export * from '@aureliajs/ssr/server';
export {
  aurelia,
  aureliaDefaults,
  setAureliaDefaults,
  serveAureliaAssets,
  createAuthMiddleware,
  createAureliaRouteGroup,
} from './adapter.js';
export type { AuthMiddlewareConfig } from './adapter.js';
export type {
  AureliaRouteConfig,
  AureliaDefaultsOptions,
  ServeAssetsOptions,
  AureliaComponentWithMetadata,
} from './types.js';
