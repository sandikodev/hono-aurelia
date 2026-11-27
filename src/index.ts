/**
 * @hono/aurelia
 *
 * Pure, Web-Standards-compliant SSR & Server Actions adapter for Aurelia 2 on Hono.
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

export const VERSION = '1.0.0-alpha.1';
