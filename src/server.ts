/**
 * @hono/aurelia Server Entrypoint
 */

export {
  aurelia,
  aureliaAction,
  aureliaDefaults,
  aureliaRenderer,
} from './adapter';

export {
  buildClient,
  buildWorker,
  createVirtualClientPlugin,
  stubJsdomPlugin,
  type ClientBuildOptions,
  type WorkerBuildOptions,
  type BuildOutputStats,
} from './builder';

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
} from './types';

export { VERSION } from './index';
