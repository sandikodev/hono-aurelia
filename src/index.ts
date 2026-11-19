/**
 * @hono/aurelia
 *
 * Pure, Web-Standards-compliant SSR & Server Actions adapter for Aurelia 2 on Hono.
 */

export {
  aurelia,
  aureliaAction,
  aureliaDefaults,
  aureliaRenderer,
} from './adapter.js';

export {
  buildClient,
  buildWorker,
  createVirtualClientPlugin,
  stubJsdomPlugin,
  type ClientBuildOptions,
  type WorkerBuildOptions,
  type BuildOutputStats,
} from './builder.js';

export type {
  AureliaActionHandler,
  AureliaActionMap,
  AureliaActionOptions,
  AureliaActionSource,
  AureliaComponent,
  AureliaDefaultsOptions,
  AureliaLoader,
  AureliaRouteComponent,
  AureliaRouteConfig,
  ComponentProps,
  DocumentOptions,
  SerializeOptions,
} from './types.js';

export const VERSION = '1.0.0-alpha.1';
