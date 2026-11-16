/**
 * @hono/aurelia-ssr Server Entrypoint
 */
export * from '@aureliajs/ssr/server';
export {
  aurelia,
  createAuthMiddleware,
  createAureliaRouteGroup,
} from './adapter.js';
export type { AuthMiddlewareConfig } from './adapter.js';
export type { AureliaRouteConfig } from './types.js';
