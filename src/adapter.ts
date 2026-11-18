/**
 * @hono/aurelia Route & Action Adapter
 *
 * Ultra-thin, zero-cast, Web-Standards-compliant Hono adapter for Aurelia 2 SSR.
 * - Scoped defaults via `WeakMap<Request, AureliaDefaultsOptions>` (zero `c.var` pollution).
 * - True Web Streams streaming SSR (flushes `<head>` before awaiting SSR render).
 * - Zero Node filesystem imports — 100% Edge/Bun/Deno/Node compatible.
 */

import type { Context, Env, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { CustomElement } from 'aurelia';
import {
  DEFAULT_SCRIPT_ID,
  createDocumentShell,
  createHtmlDocument,
  createHydrationScript,
  renderAurelia,
  serializeState,
  type AureliaComponent,
  type ComponentProps,
  type RenderContext,
} from '@aureliajs/ssr';
import type {
  AureliaActionHandler,
  AureliaActionMap,
  AureliaActionOptions,
  AureliaActionSource,
  AureliaDefaultsOptions,
  AureliaRouteComponent,
  AureliaRouteConfig,
} from './types.js';

/**
 * Per-request scoped defaults keyed by the Web Standard `Request` instance.
 * Avoids polluting Hono's `c.var`, requires zero type casts, and auto-GCs with the request.
 */
const defaultsByRequest = new WeakMap<Request, unknown>();

/**
 * Hono middleware registering router-scoped defaults for downstream `aurelia()` handlers.
 */
export function aureliaDefaults<E extends Env = Env>(
  defaults: AureliaDefaultsOptions<E>
): MiddlewareHandler<E> {
  return async (c, next) => {
    const existing = defaultsByRequest.get(c.req.raw) as AureliaDefaultsOptions<E> | undefined;
    const merged: AureliaDefaultsOptions<E> = {
      ...existing,
      ...defaults,
      document: {
        ...existing?.document,
        ...defaults.document,
      },
    };
    defaultsByRequest.set(c.req.raw, merged);
    await next();
  };
}

function acceptsJsonOverHtml(acceptHeader?: string): boolean {
  if (!acceptHeader || !acceptHeader.includes('application/json')) return false;
  if (!acceptHeader.includes('text/html')) return true;

  const parseQ = (mime: string): number => {
    const idx = acceptHeader.toLowerCase().indexOf(mime);
    if (idx === -1) return 0;
    const segment = acceptHeader.slice(idx + mime.length).split(',')[0] ?? '';
    const qMatch = /;\s*q=([0-9.]+)/i.exec(segment);
    if (!qMatch?.[1]) return 1;
    const value = Number(qMatch[1]);
    return Number.isFinite(value) ? value : 0;
  };

  return parseQ('application/json') > parseQ('text/html');
}

function resolveComponentName(component: unknown): string {
  if (!component) return 'Page';
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
  const named = component as { name?: string };
  return named.name || 'Page';
}

function isRouteConfig<
  E extends Env,
  TComponent extends object,
  TData extends Record<string, unknown>,
>(value: unknown): value is AureliaRouteConfig<E, TComponent, TData> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    'component' in (value as Record<string, unknown>) &&
    !CustomElement.isType((value as object).constructor)
  );
}

/**
 * Aurelia 2 SSR route handler factory for Hono.
 */
export function aurelia<
  E extends Env = Env,
  TComponent extends object = object,
  TData extends Record<string, unknown> = ComponentProps<TComponent>,
>(config: AureliaRouteConfig<E, TComponent, TData>): (c: Context<E>) => Promise<Response>;
export function aurelia<
  E extends Env = Env,
  TComponent extends object = object,
  TData extends Record<string, unknown> = ComponentProps<TComponent>,
>(
  component: AureliaComponent<TComponent>,
  title?: string | ((data: TData, c: Context<E>) => string)
): (c: Context<E>) => Promise<Response>;
export function aurelia<
  E extends Env = Env,
  TComponent extends object = object,
  TData extends Record<string, unknown> = ComponentProps<TComponent>,
>(
  configOrComponent:
    | AureliaRouteConfig<E, TComponent, TData>
    | AureliaComponent<TComponent>,
  maybeTitle?: string | ((data: TData, c: Context<E>) => string)
): (c: Context<E>) => Promise<Response> {
  const config: AureliaRouteConfig<E, TComponent, TData> = isRouteConfig<E, TComponent, TData>(
    configOrComponent
  )
    ? configOrComponent
    : { component: configOrComponent, title: maybeTitle };

  const compMeta = config.component as unknown as
    | AureliaRouteComponent<E, TComponent, TData>
    | null
    | undefined;

  return async (c: Context<E>): Promise<Response> => {
    const scoped = defaultsByRequest.get(c.req.raw) as AureliaDefaultsOptions<E> | undefined;

    const streaming = config.streaming ?? scoped?.streaming ?? false;
    const dataEndpoint = config.dataEndpoint ?? scoped?.dataEndpoint ?? false;
    const preserveMarkers = config.preserveMarkers ?? scoped?.preserveMarkers ?? true;
    const engine = config.engine ?? scoped?.engine;
    const fallback = config.fallback ?? compMeta?.fallback ?? scoped?.fallback ?? 'throw';
    const documentOpts = { ...scoped?.document, ...config.document };
    const serializeOpts = config.serialize ?? scoped?.serialize;
    const onError = config.onError ?? scoped?.onError;
    const timeout = config.timeout ?? scoped?.timeout;
    const registrations = [...(scoped?.registrations ?? []), ...(config.registrations ?? [])];

    try {
      // 1. Extract request context (defaults directly to Hono's c.var without internal pollution)
      const contextResolver = config.context ?? scoped?.context;
      const context: RenderContext = contextResolver
        ? await contextResolver(c)
        : ((c.var as Record<string, unknown> | undefined) ?? {});

      // 2. Execute single typed loader (route config overrides co-located static loader)
      const activeLoader = config.loader ?? compMeta?.loader;
      let initialData = {} as TData;

      if (typeof activeLoader === 'function') {
        try {
          const loaded = await activeLoader(c);
          if (loaded instanceof Response) {
            return loaded;
          }
          if (loaded && typeof loaded === 'object') {
            initialData = loaded;
          }
        } catch (loaderError) {
          if (fallback !== 'spa') throw loaderError;
        }
      }

      const componentName = resolveComponentName(config.component);

      // 3. Resolve title & HTTP status code
      const titleSource = config.title ?? compMeta?.title ?? compMeta?.name;
      const effectiveTitle =
        typeof titleSource === 'function'
          ? titleSource(initialData, c) || 'Aurelia App'
          : titleSource || 'Aurelia App';

      const statusSource = config.status ?? compMeta?.status;
      const effectiveStatus: ContentfulStatusCode =
        typeof statusSource === 'function'
          ? statusSource(initialData, c)
          : statusSource ?? 200;

      // 4. Opt-in JSON data endpoint
      if (dataEndpoint && acceptsJsonOverHtml(c.req.header('Accept'))) {
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

      const renderOptions = {
        component: config.component,
        context,
        props: initialData as ComponentProps<TComponent>,
        url: c.req.url,
        params: c.req.param(),
        query: c.req.query(),
        engine,
        preserveMarkers,
        registrations: registrations.length > 0 ? registrations : undefined,
        timeout,
      };

      // 5. True Web Streams streaming SSR: flush <head> immediately before awaiting SSR body
      if (streaming && !documentOpts.template) {
        const shell = createDocumentShell({
          title: effectiveTitle,
          ...documentOpts,
        });
        const scriptId = documentOpts.scriptId ?? DEFAULT_SCRIPT_ID;
        const encoder = new TextEncoder();

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              // Flush <head> + CSS links immediately for near-zero TTFB
              controller.enqueue(encoder.encode(shell.preamble));

              let html = '';
              try {
                html = await renderAurelia(renderOptions);
              } catch (renderError) {
                if (fallback === 'spa') {
                  html = '';
                } else {
                  throw renderError;
                }
              }

              const payload = await serializeState(
                context,
                initialData,
                componentName,
                serializeOpts
              );

              controller.enqueue(encoder.encode(html));
              controller.enqueue(encoder.encode(`\n    ${createHydrationScript(payload, scriptId)}`));
              controller.enqueue(encoder.encode(shell.postamble));
              controller.close();
            } catch (streamError) {
              controller.error(streamError);
            }
          },
        });

        return c.body(stream, effectiveStatus, {
          'Content-Type': 'text/html; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        });
      }

      // 6. Buffered HTML5 SSR response
      let html = '';
      try {
        html = await renderAurelia(renderOptions);
      } catch (renderError) {
        if (fallback === 'spa') {
          html = '';
        } else {
          throw renderError;
        }
      }

      const payload = await serializeState(context, initialData, componentName, serializeOpts);
      const document = createHtmlDocument(html, payload, {
        title: effectiveTitle,
        ...documentOpts,
      });

      return c.html(document, effectiveStatus);
    } catch (error) {
      if (typeof onError === 'function') {
        return await onError(error, c);
      }
      throw error;
    }
  };
}

function hasActionsObject<E extends Env>(
  source: AureliaActionSource<E>
): source is { readonly actions: AureliaActionMap<E> } {
  return (
    'actions' in source &&
    typeof source.actions === 'object' &&
    source.actions !== null
  );
}

function hasSingleAction<E extends Env>(
  source: AureliaActionSource<E>
): source is { readonly action: AureliaActionHandler<E> } {
  return 'action' in source && typeof source.action === 'function';
}

/**
 * Strictly typed explicit Hono route handler for Aurelia server actions.
 *
 * Accepts either a named action map `{ like, comment }` or a component exposing
 * static `actions` / `action`. Zero runtime constructor sniffing.
 */
export function aureliaAction<E extends Env = Env>(
  source: AureliaActionSource<E>,
  options?: AureliaActionOptions<E>
): (c: Context<E>) => Promise<Response> {
  const actionMap: AureliaActionMap<E> | undefined = hasActionsObject(source)
    ? source.actions
    : hasSingleAction(source)
      ? undefined
      : (source as AureliaActionMap<E>);

  const singleAction: AureliaActionHandler<E> | undefined = hasSingleAction(source)
    ? source.action
    : undefined;

  return async (c: Context<E>): Promise<Response> => {
    const resolved = options?.resolveAction
      ? await options.resolveAction(c)
      : c.req.query('_action') || c.req.header('X-Action');
    const actionName = resolved || 'default';

    const handler =
      actionMap?.[actionName] ?? (actionName === 'default' ? singleAction : undefined);

    if (!handler) {
      if (actionMap && Object.keys(actionMap).length > 0) {
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
