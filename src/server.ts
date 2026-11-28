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

export {
  aureliaStream,
  createAureliaEventStream,
  frameAureliaStreamEvent,
  type AureliaStreamEvent,
  type AureliaStreamFactory,
  type AureliaStreamOptions,
  type AureliaStreamSource,
  type AureliaStreamValue,
} from './stream';

export {
  defineEnv,
  type DefineEnvOptions,
  type DefinedEnv,
  type EnvField,
  type EnvFieldOptions,
  type EnvSchema,
  type EnvSource,
  type EnvValueType,
  type EnvValues,
  type PublicEnv,
  type ResolvedEnv,
} from './env';

export { VERSION } from './index';
