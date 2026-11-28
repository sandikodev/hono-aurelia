/**
 * @hono/aurelia Server-Sent Events
 *
 * Web-Standards alternative to framework-bound live queries: any `AsyncIterable`
 * becomes a `text/event-stream` response with JSON framing, idle keep-alive
 * comments, and generator cleanup on client disconnect.
 *
 * No `node:*` import, no compiler magic, no RPC stub. Works on Hono in Workers,
 * Bun, and Node because it only uses `Response`, `ReadableStream`, and `TextEncoder`.
 */

import type { Context } from 'hono';

/** Explicit SSE frame. Objects without a `data` property are treated as plain payloads. */
export interface AureliaStreamEvent<T = unknown> {
  readonly data: T;
  readonly event?: string;
  readonly id?: string | number;
  readonly retry?: number;
}

export type AureliaStreamValue<T> = T | AureliaStreamEvent<T>;

export type AureliaStreamSource<T> =
  | AsyncIterable<AureliaStreamValue<T>>
  | Iterable<AureliaStreamValue<T>>;

export type AureliaStreamFactory<T> = (
  c: Context
) => AureliaStreamSource<T> | Promise<AureliaStreamSource<T>>;

export interface AureliaStreamOptions {
  /** Defaults to the request's abort signal; pass one explicitly when using a bare stream. */
  readonly signal?: AbortSignal;
  /** Idle gap before a `: keep-alive` comment is sent. Default 15000, 0 disables it. */
  readonly heartbeatMs?: number;
  /** Event name used for plain payloads. Default `message`. */
  readonly event?: string;
  /** Keep-alive comment text. Default `keep-alive`. */
  readonly keepAlive?: string;
  readonly onError?: (error: unknown) => void;
}

function sanitizeField(value: string): string {
  return value.replace(/[\r\n]/g, '').trim();
}

function isEventFrame<T>(value: AureliaStreamValue<T>): value is AureliaStreamEvent<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.prototype.hasOwnProperty.call(value, 'data')
  );
}

/** Serialize one value into a complete SSE frame. Exported for direct unit testing. */
export function frameAureliaStreamEvent<T>(
  value: AureliaStreamValue<T>,
  defaultEvent = 'message'
): string {
  const frame = isEventFrame(value) ? value : ({ data: value } as AureliaStreamEvent<T>);
  const event = sanitizeField(frame.event ?? defaultEvent) || 'message';
  const lines: string[] = [];

  if (frame.id !== undefined && frame.id !== null) {
    const id = sanitizeField(String(frame.id));
    if (id) lines.push(`id: ${id}`);
  }
  lines.push(`event: ${event}`);
  if (typeof frame.retry === 'number' && Number.isFinite(frame.retry)) {
    lines.push(`retry: ${Math.max(0, Math.floor(frame.retry))}`);
  }
  lines.push(`data: ${JSON.stringify(frame.data) ?? 'null'}`);
  return `${lines.join('\n')}\n\n`;
}

/**
 * Turn an iterable into a byte stream of SSE frames.
 *
 * Heartbeats are scheduled relative to the last emitted frame, so they never
 * pile up while the source is busy. Abort, consumer cancel, and source errors
 * all dispose the iterator exactly once.
 */
export function createAureliaEventStream<T>(
  source: AureliaStreamSource<T> | Promise<AureliaStreamSource<T>>,
  options: AureliaStreamOptions = {}
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  let dispose: () => void = () => {};

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let iterator: AsyncIterator<AureliaStreamValue<T>> | Iterator<AureliaStreamValue<T>> | null = null;
      const signal = options.signal;

      const enqueue = (text: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          dispose();
        }
      };

      const armHeartbeat = (): void => {
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
        if (closed || heartbeatMs <= 0) return;
        timer = setTimeout(() => {
          timer = undefined;
          if (closed) return;
          enqueue(`: ${options.keepAlive ?? 'keep-alive'}\n\n`);
          armHeartbeat();
        }, heartbeatMs);
      };

      const disposeStream = (): void => {
        if (closed) return;
        closed = true;
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
        signal?.removeEventListener('abort', onAbort);
        try {
          controller.close();
        } catch {
          // The consumer may already have cancelled the stream.
        }
        const stoppable = iterator as { return?: () => unknown } | null;
        if (typeof stoppable?.return === 'function') {
          try {
            void Promise.resolve(stoppable.return()).catch(() => {});
          } catch {
            // A generator may reject its return() during teardown.
          }
        }
      };
      dispose = disposeStream;

      const onAbort = (): void => disposeStream();
      if (signal) {
        if (signal.aborted) {
          disposeStream();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      void (async () => {
        const resolved = await source;
        if (closed) return;

        const asyncIterable = resolved as AsyncIterable<AureliaStreamValue<T>>;
        iterator =
          typeof asyncIterable[Symbol.asyncIterator] === 'function'
            ? asyncIterable[Symbol.asyncIterator]()
            : (resolved as Iterable<AureliaStreamValue<T>>)[Symbol.iterator]();

        armHeartbeat();
        for (;;) {
          const step = await iterator.next();
          if (closed || step.done) break;
          if (step.value !== undefined) {
            enqueue(frameAureliaStreamEvent(step.value, options.event));
          }
          armHeartbeat();
        }
        disposeStream();
      })().catch((error: unknown) => {
        options.onError?.(error);
        enqueue(
          `event: error\ndata: ${JSON.stringify({
            message: error instanceof Error ? error.message : String(error),
          })}\n\n`
        );
        disposeStream();
      });
    },
    cancel() {
      dispose();
    },
  });
}

/** Hono handler that streams values from an iterable or a per-request factory. */
export function aureliaStream<T>(
  source: AureliaStreamSource<T> | AureliaStreamFactory<T>,
  options: AureliaStreamOptions = {}
): (c: Context) => Response {
  return (c: Context): Response => {
    const signal = options.signal ?? c.req.raw?.signal;
    const resolved =
      typeof source === 'function'
        ? (source as AureliaStreamFactory<T>)(c)
        : source;

    return new Response(
      createAureliaEventStream<T>(Promise.resolve(resolved), { ...options, signal }),
      {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      }
    );
  };
}
