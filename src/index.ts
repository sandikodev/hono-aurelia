/**
 * @hono/aurelia-ssr
 * 
 * Server-side rendering adapter for Aurelia 2 on Hono.
 * Built on top of @aureliajs/ssr.
 */

// Re-export full @aureliajs/ssr core API
export * from '@aureliajs/ssr';

// Hono Route Adapter
export {
  aurelia,
  createAuthMiddleware,
  createAureliaRouteGroup,
} from './adapter.js';
export type { AuthMiddlewareConfig } from './adapter.js';
export type { AureliaRouteConfig } from './types.js';

// Version
export const VERSION = '1.0.0-alpha.1';
