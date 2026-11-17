/**
 * @hono/aurelia
 * 
 * Thin server-side rendering adapter for Aurelia 2 on Hono.
 */

export {
  aurelia,
  aureliaDefaults,
  setAureliaDefaults,
  serveAureliaAssets,
} from './adapter.js';

export type {
  AureliaRouteConfig,
  AureliaDefaultsOptions,
  ServeAssetsOptions,
  AureliaComponentWithMetadata,
  DocumentOptions,
} from './types.js';

export const VERSION = '1.0.0-alpha.1';
