/**
 * @hono/aurelia Route Adapter
 *
 * Ultra-thin, Web-Standards-compliant Hono adapter for Aurelia 2 SSR.
 * Zero Node filesystem dependencies, zero module-level global mutable state,
 * and zero parallel auth/static middleware re-implementations.
 */

import type { Context, Env, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { CustomElement } from 'aurelia';
import {
  renderAurelia,
  serializeState,
  createHtmlDocument,
  type RenderContext,
} from '@aureliajs/ssr';
import type {
  AureliaActionHandler,
  AureliaActionOptions,
  AureliaComponentWithMetadata,
  AureliaDefaultsOptions,
  AureliaLoader,
  AureliaRouteConfig,
} from './types.js';

const DEFAULTS_KEY = '__aurelia_defaults';

/**
 * Hono middleware that provides router-scoped defaults (document options, streaming,
 * opt-in dataEndpoint, error handler, registrations) to downstream `aurelia()` handlers.
 */
export function aureliaDefaults<E extends Env = Env>(
  defaults: AureliaDefaultsOptions<E>
): MiddlewareHandler<E> {
  return async (c, next) => {
    const existing = (c.get as (k: string) => AureliaDefaultsOptions<E> | undefined)(DEFAULTS_KEY);
    const merged: AureliaDefaultsOptions<E> = {
      ...existing,
      ...defaults,
      document: {
        ...existing?.document,
        ...defaults.document,
      },
    };
    (c.set as (k: string, v: unknown) => void)(DEFAULTS_KEY, merged);
    await next();
  };
}

function prefersJson(acceptHeader?: string): boolean {
  if (!acceptHeader) return false;
  const hasJson = acceptHeader.includes('application/json');
  if (!hasJson) return false;
  const hasHtml = acceptHeader.includes('text/html');
  if (!hasHtml) return true;

  const jsonQ = extractQValue(acceptHeader, 'application/json');
  const htmlQ = extractQValue(acceptHeader, 'text/html');
  return jsonQ > htmlQ;
}

function extractQValue(acceptHeader: string, mimeType: string): number {
  const escaped = mimeType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = acceptHeader.match(new RegExp(`${escaped}(?:;\\s*q=([0-9.]+))?`, 'i'));
  if (!match) return 0;
  if (!match[1]) return 1;
  const q = parseFloat(match[1]);
  return Number.isNaN(q) ? 0 : Math.min(Math.max(q, 0), 1);
}

function extractDefaultContext<E extends Env>(c: Context<E>): RenderContext {
  const raw = (c.var as Record<string, unknown> | undefined) ?? {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === DEFAULTS_KEY) continue;
    result[key] = value;
  }
  return result;
}

function resolveComponentName(component: unknown): string {
  if (!component) return 'Page';
  try {
    if (typeof component === 'function' && CustomElement.isType(component)) {
      return CustomElement.getDefinition(component).name;
    }
    if (
      typeof component === 'object' &&
      component.constructor &&
      CustomElement.isType(component.constructor)
    ) {
      return CustomElement.getDefinition(component.constructor).name;
    }
  } catch {
    // Fallback to identifier lookup
  }

  const record = component as { name?: string };
  if (typeof record.name === 'string' && record.name) {
    return record.name;
  }
  if (typeof component === 'function' && component.name) {
    return component.name;
  }
  return 'Page';
}

async function runNamedLoaders<E extends Env>(
  loaders: Record<string, AureliaLoader<E>>,
  c: Context<E>
): Promise<{ data: Record<string, unknown>; response?: Response }> {
  const entries = Object.entries(loaders);
  if (entries.length === 0) return { data: {} };

  const settled = await Promise.all(
    entries.map(async ([key, loader]) => ({
      key,
      value: await loader(c),
    }))
  );

  const data: Record<string, unknown> = {};
  for (const item of settled) {
    if (item.value instanceof Response) {
      return { data: {}, response: item.value };
    }
    data[item.key] = item.value;
  }

  return { data };
}

/**
 * Aurelia 2 SSR route handler factory for Hono.
 *
 * Supports both ergonomic shorthand and full typed configuration:
 * ```ts
 * app.get('/', aurelia(HomePage));
 * app.get('/dashboard', requireAuth, aurelia(DashboardPage));
 * app.get('/posts/:slug', aurelia({ component: PostPage, streaming: true }));
 * ```
 */
export function aurelia<
  E extends Env = Env,
  TData extends Record<string, unknown> = Record<string, unknown>,
>(config: AureliaRouteConfig<E, TData>): (c: Context<E>) => Promise<Response>;
export function aurelia<
  E extends Env = Env,
  TData extends Record<string, unknown> = Record<string, unknown>,
>(
  component: unknown,
  title?: string | ((data: TData, c: Context<E>) => string)
): (c: Context<E>) => Promise<Response>;
export function aurelia<
  E extends Env = Env,
  TData extends Record<string, unknown> = Record<string, unknown>,
>(
  configOrComponent: AureliaRouteConfig<E, TData> | unknown,
  maybeTitle?: string | ((data: TData, c: Context<E>) => string)
): (c: Context<E>) => Promise<Response> {
  const isPlainConfig =
    Boolean(configOrComponent) &&
    typeof configOrComponent === 'object' &&
    'component' in (configOrComponent as Record<string, unknown>);

  const config: AureliaRouteConfig<E, TData> = isPlainConfig
    ? { ...(configOrComponent as AureliaRouteConfig<E, TData>) }
    : { component: configOrComponent, title: maybeTitle };

  const comp = config.component as AureliaComponentWithMetadata<E, TData> | null | undefined;

  return async (c: Context<E>): Promise<Response> => {
    const scopedDefaults = (c.get as (k: string) => AureliaDefaultsOptions<E> | undefined)(
      DEFAULTS_KEY
    );

    const effectiveStreaming = config.streaming ?? scopedDefaults?.streaming ?? false;
    const effectiveDataEndpoint = config.dataEndpoint ?? scopedDefaults?.dataEndpoint ?? false;
    const effectiveFallback =
      config.fallback ?? comp?.fallback ?? scopedDefaults?.fallback ?? 'throw';
    const effectiveDocument = {
      ...scopedDefaults?.document,
      ...config.document,
    };
    const effectiveSerialize = config.serialize ?? scopedDefaults?.serialize;
    const effectiveOnError = config.onError ?? scopedDefaults?.onError;
    const effectiveTimeout = config.timeout ?? scopedDefaults?.timeout;
    const effectiveRegistrations = [
      ...(scopedDefaults?.registrations ?? []),
      ...(config.registrations ?? []),
    ];

    try {
      // 1. Resolve render context
      const contextResolver = config.context ?? scopedDefaults?.context;
      const context: RenderContext = contextResolver
        ? await contextResolver(c)
        : extractDefaultContext(c);

      // 2. Execute co-located and route-configured loaders
      const initialData: Record<string, unknown> = {};

      const executeSingleLoader = async (
        loaderFn: AureliaLoader<E, unknown>
      ): Promise<Response | null> => {
        const result = await loaderFn(c);
        if (result instanceof Response) return result;
        if (result && typeof result === 'object') {
          Object.assign(initialData, result);
        }
        return null;
      };

      const runLoadersPhase = async (): Promise<Response | null> => {
        if (typeof comp?.loader === 'function') {
          const shortCircuit = await executeSingleLoader(comp.loader);
          if (shortCircuit) return shortCircuit;
        }
        if (comp?.loaders && typeof comp.loaders === 'object') {
          const res = await runNamedLoaders(comp.loaders, c);
          if (res.response) return res.response;
          Object.assign(initialData, res.data);
        }
        if (typeof config.loader === 'function') {
          const shortCircuit = await executeSingleLoader(config.loader);
          if (shortCircuit) return shortCircuit;
        }
        if (config.loaders) {
          const res = await runNamedLoaders(config.loaders, c);
          if (res.response) return res.response;
          Object.assign(initialData, res.data);
        }
        return null;
      };

      try {
        const loaderResponse = await runLoadersPhase();
        if (loaderResponse) return loaderResponse;
      } catch (loaderError) {
        if (effectiveFallback !== 'spa') {
          throw loaderError;
        }
      }

      const componentName = resolveComponentName(config.component);
      const typedData = initialData as TData;

      // 3. Resolve dynamic title and HTTP status
      let effectiveTitle = 'Aurelia App';
      const titleCandidate = config.title ?? comp?.title ?? comp?.name;
      if (typeof titleCandidate === 'function') {
        effectiveTitle = titleCandidate(typedData, c) || 'Aurelia App';
      } else if (typeof titleCandidate === 'string' && titleCandidate) {
        effectiveTitle = titleCandidate;
      }

      let effectiveStatus: ContentfulStatusCode = 200;
      if (typeof config.status === 'function') {
        effectiveStatus = config.status(typedData, c);
      } else if (typeof config.status === 'number') {
        effectiveStatus = config.status;
      } else if (typeof comp?.status === 'function') {
        effectiveStatus = comp.status(typedData, c);
      } else if (typeof comp?.status === 'number') {
        effectiveStatus = comp.status;
      }

      // 4. Opt-in JSON data endpoint
      if (effectiveDataEndpoint && prefersJson(c.req.header('Accept'))) {
        return c.json(
          {
            component: componentName,
            title: effectiveTitle,
            context,
            initialData,
            timestamp: Date.now(),
          },
          effectiveStatus
        );
      }

      // 5. Server-side render Aurelia 2 component
      let html = '';
      try {
        html = await renderAurelia({
          component: config.component,
          context,
          props: initialData,
          url: c.req.url,
          params: c.req.param(),
          query: c.req.query(),
          registrations: effectiveRegistrations.length > 0 ? effectiveRegistrations : undefined,
          timeout: effectiveTimeout,
        });
      } catch (renderError) {
        if (effectiveFallback === 'spa') {
          html = '';
        } else {
          throw renderError;
        }
      }

      // 6. Serialize hydration payload and emit HTML (buffered or streamed)
      const payload = await serializeState(
        context,
        initialData,
        componentName,
        effectiveSerialize
      );

      if (effectiveStreaming) {
        const marker = '<!--__AURELIA_SSR_STREAM_SPLIT__-->';
        const shell = createHtmlDocument(marker, payload, {
          title: effectiveTitle,
          ...effectiveDocument,
        });
        const [preamble = '', postamble = ''] = shell.split(marker);
        const encoder = new TextEncoder();

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(preamble));
            controller.enqueue(encoder.encode(html));
            controller.enqueue(encoder.encode(postamble));
            controller.close();
          },
        });

        return c.body(stream, effectiveStatus, {
          'Content-Type': 'text/html; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        });
      }

      const document = createHtmlDocument(html, payload, {
        title: effectiveTitle,
        ...effectiveDocument,
      });

      return c.html(document, effectiveStatus);
    } catch (error) {
      if (typeof effectiveOnError === 'function') {
        return await effectiveOnError(error, c);
      }
      throw error;
    }
  };
}

/**
 * Explicit Hono route handler for Aurelia co-located or standalone server actions.
 *
 * Mount explicitly on mutation HTTP verbs (`app.post`, `app.put`, `app.delete`):
 * ```ts
 * app.get('/posts/:slug', aurelia(PostDetailPage));
 * app.post('/posts/:slug', aureliaAction(PostDetailPage));
 * ```
 */
export function aureliaAction<E extends Env = Env>(
  target:
    | AureliaComponentWithMetadata<E>
    | AureliaActionHandler<E>
    | Record<string, AureliaActionHandler<E>>
    | unknown,
  options?: AureliaActionOptions<E>
): (c: Context<E>) => Promise<Response> {
  return async (c: Context<E>): Promise<Response> => {
    const resolvedName = options?.resolveAction
      ? await options.resolveAction(c)
      : c.req.query('_action') || c.req.header('X-Action');
    const actionName = resolvedName || 'default';

    let handler: AureliaActionHandler<E> | undefined;
    let hasNamedActions = false;

    const isComponentClass =
      typeof target === 'function' &&
      (CustomElement.isType(target) || /^\s*class\b/.test(Function.prototype.toString.call(target)));

    if (
      typeof target === 'function' &&
      !isComponentClass &&
      !('actions' in target) &&
      !('action' in target)
    ) {
      if (actionName === 'default') {
        handler = target as AureliaActionHandler<E>;
      }
    } else if (target && (typeof target === 'object' || typeof target === 'function')) {
      const comp = target as AureliaComponentWithMetadata<E>;
      if (comp.actions && typeof comp.actions === 'object') {
        hasNamedActions = Object.keys(comp.actions).length > 0;
        handler = comp.actions[actionName];
      } else if (!isComponentClass && !('action' in comp)) {
        const map = target as Record<string, AureliaActionHandler<E>>;
        hasNamedActions = Object.keys(map).length > 0;
        if (typeof map[actionName] === 'function') {
          handler = map[actionName];
        }
      }

      if (!handler && actionName === 'default' && typeof comp.action === 'function') {
        handler = comp.action;
      }
    }

    if (!handler) {
      if (hasNamedActions) {
        return c.json({ error: `Action "${actionName}" not found` }, 404);
      }
      return c.text('Method Not Allowed', 405);
    }

    const result = await handler(c);
    if (result instanceof Response) {
      return result;
    }

    return c.json(result !== undefined ? result : { success: true });
  };
}
