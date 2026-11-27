/**
 * @hono/aurelia Server Entrypoint
 */

export {
  aurelia,
  aureliaAction,
  aureliaDefaults,
  aureliaLayout,
  aureliaRenderer,
} from './adapter';

export type {
  AureliaActionHandler,
  AureliaActionMap,
  AureliaActionOptions,
  AureliaActionSource,
  AureliaComponent,
  AureliaCsrfOptions,
  AureliaDefaultsOptions,
  AureliaLayoutOptions,
  AureliaLoader,
  AureliaRouteComponent,
  AureliaRouteConfig,
  ComponentProps,
  DocumentOptions,
  SerializeOptions,
} from './types';

export { VERSION } from './index';
