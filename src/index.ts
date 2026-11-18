/**
 * @hono/aurelia
 *
 * Thin, Web-Standards-compliant SSR & action adapter for Aurelia 2 on Hono.
 */

export {
  aurelia,
  aureliaAction,
  aureliaDefaults,
} from './adapter.js';

export type {
  AureliaActionHandler,
  AureliaActionOptions,
  AureliaComponentWithMetadata,
  AureliaDefaultsOptions,
  AureliaLoader,
  AureliaRouteConfig,
  DocumentOptions,
  SerializeOptions,
} from './types.js';

export const VERSION = '1.0.0-alpha.1';
