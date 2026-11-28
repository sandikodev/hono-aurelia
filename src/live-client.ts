/**
 * @hono/aurelia Client Live Streams
 *
 * Counterpart of `aureliaStream()`: consumes `text/event-stream` with `fetch`,
 * decodes JSON frames, and exposes them as an async iterable. No EventSource
 * global, no framework directive, no server code in the client bundle.
 */

export interface LiveMessage<T = unknown> {
  readonly data: T;
  readonly event: string;
  readonly id?: string;
}

export interface LiveStreamOptions {
  /** Only deliver frames with this event name. Default: all frames. */
  readonly event?: string;
  readonly fetch?: typeof fetch;
  readonly headers?: HeadersInit;
  readonly signal?: AbortSignal;
  readonly onError?: (error: unknown) => void;
}

export interface LiveStreamController<T = unknown> extends AsyncIterable<LiveMessage<T>> {
  /** Resolves when the HTTP response has been validated; rejects on a failed stream. */
  readonly response: Promise<Response>;
  readonly closed: boolean;
  close(): void;
}

/** Parse one raw SSE frame. Exported so framing can be tested without a socket. */
export function parseLiveFrame(frame: string): LiveMessage<string> | null {
  let event = '';
  let id = '';
  const data: string[] = [];

  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const raw = colon === -1 ? '' : line.slice(colon + 1);
    const value = raw.startsWith(' ') ? raw.slice(1) : raw;

    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    else if (field === 'id') id = value;
  }

  if (data.length === 0) return null;
  return {
    data: data.join('\n'),
    event: event || 'message',
    ...(id ? { id } : {}),
  };
}

function decodeValue<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T;
  }
}

/** Start a live stream. Call `await controller.response` before assuming it is connected. */
export function createLiveStream<T = unknown>(
  url: string | URL,
  options: LiveStreamOptions = {}
): LiveStreamController<T> {
  const internal = new AbortController();
  const external = options.signal;
  let closed = false;
  let emit!: ReadableStreamDefaultController<LiveMessage<T>>;

  const onExternalAbort = (): void => {
    if (external?.aborted && !closed) controller.close();
  };

  const stream = new ReadableStream<LiveMessage<T>>({
    start(controller) {
      emit = controller;
    },
    cancel() {
      if (closed) return;
      closed = true;
      internal.abort();
      external?.removeEventListener('abort', onExternalAbort);
    },
  });

  let resolveResponse!: (response: Response) => void;
  let rejectResponse!: (error: unknown) => void;
  const response = new Promise<Response>((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  // A caller may intentionally ignore the response promise. Keep it observed.
  void response.catch(() => {});

  const controller: LiveStreamController<T> = {
    get closed() {
      return closed;
    },
    response,
    close(): void {
      if (closed) return;
      closed = true;
      internal.abort();
      external?.removeEventListener('abort', onExternalAbort);
      try {
        emit.close();
      } catch {
        // Already closed by the reader.
      }
    },
    async *[Symbol.asyncIterator](): AsyncIterator<LiveMessage<T>> {
      const reader = stream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    },
  };

  if (external) {
    if (external.aborted) {
      controller.close();
    } else {
      external.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  void (async () => {
    const decoder = new TextDecoder();
    let buffer = '';

    const deliverFrames = (): void => {
      buffer = buffer.replace(/\r\n/g, '\n');
      for (;;) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary === -1) break;
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseLiveFrame(raw);
        if (!parsed) continue;
        if (options.event && parsed.event !== options.event) continue;
        if (closed) return;
        try {
          emit.enqueue({
            data: decodeValue<T>(parsed.data),
            event: parsed.event,
            ...(parsed.id ? { id: parsed.id } : {}),
          });
        } catch {
          closed = true;
          return;
        }
      }
    };

    try {
      const fetchFn = options.fetch ?? fetch;
      const res = await fetchFn(typeof url === 'string' ? url : url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...(options.headers as Record<string, string> | undefined),
        },
        signal: internal.signal,
      });

      if (!res.ok) {
        throw new Error(`[createLiveStream] Stream failed with ${res.status} ${res.statusText}`);
      }
      if (!(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
        throw new Error('[createLiveStream] Response is not text/event-stream');
      }
      if (closed || !res.body) {
        if (!closed) controller.close();
        resolveResponse(res);
        return;
      }

      resolveResponse(res);
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          deliverFrames();
        }
        if (closed) {
          await reader.cancel().catch(() => {});
          return;
        }
      }
      buffer += decoder.decode();
      deliverFrames();
      controller.close();
    } catch (error) {
      if (!closed) controller.close();
      rejectResponse(error);
      options.onError?.(error);
    } finally {
      external?.removeEventListener('abort', onExternalAbort);
    }
  })();

  return controller;
}

/** Subscribe to a live stream and invoke the handler for each decoded message. */
export async function subscribeLive<T = unknown>(
  url: string | URL,
  handler: (message: LiveMessage<T>) => void | Promise<void>,
  options: LiveStreamOptions = {}
): Promise<LiveStreamController<T>> {
  const controller = createLiveStream<T>(url, options);
  await controller.response;

  void (async () => {
    for await (const message of controller) {
      await handler(message);
    }
  })();

  return controller;
}
