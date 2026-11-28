import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import {
  aureliaStream,
  createAureliaEventStream,
  frameAureliaStreamEvent,
  type AureliaStreamEvent,
} from '../src/stream';
import {
  createLiveStream,
  parseLiveFrame,
  subscribeLive,
  type LiveMessage,
} from '../src/client';

async function waitUntil(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for live stream state');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function readAll(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) throw new Error('Missing response body');
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

describe('@hono/aurelia SSE live helper', () => {
  it('frames plain payloads, named events, ids, retries, and sanitizes field injection', () => {
    expect(frameAureliaStreamEvent({ temp: 21 })).toBe(
      'event: message\ndata: {"temp":21}\n\n'
    );

    const event: AureliaStreamEvent<{ ok: boolean }> = {
      data: { ok: true },
      event: 'tick\ninjected',
      id: '42\r\nbad',
      retry: 2500.9,
    };
    expect(frameAureliaStreamEvent(event)).toBe(
      'id: 42bad\nevent: tickinjected\nretry: 2500\ndata: {"ok":true}\n\n'
    );
    expect(frameAureliaStreamEvent(undefined)).toBe('event: message\ndata: null\n\n');
    expect(parseLiveFrame('id: a\nevent: tick\ndata: {"n":1}\ndata: tail')).toEqual({
      id: 'a',
      event: 'tick',
      data: '{"n":1}\ntail',
    });
    expect(parseLiveFrame(': keep-alive')).toBeNull();
  });

  it('produces a real Hono text/event-stream response with JSON frames', async () => {
    const app = new Hono();
    app.get(
      '/events',
      aureliaStream(
        async function* () {
          yield { data: { temperature: 21 }, event: 'reading', id: 'r-1' };
          yield { complete: true };
        },
        { heartbeatMs: 0 }
      )
    );

    const res = await app.request('http://localhost/events');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    expect(await readAll(res.body)).toBe(
      [
        'id: r-1\nevent: reading\ndata: {"temperature":21}\n\n',
        'event: message\ndata: {"complete":true}\n\n',
      ].join('')
    );
  });

  it('emits keep-alive comments during an idle source and keeps streaming afterwards', async () => {
    const source = (async function* () {
      yield { data: { step: 1 } };
      await new Promise((resolve) => setTimeout(resolve, 80));
      yield { data: { step: 2 } };
    })();

    const text = await readAll(createAureliaEventStream(source, { heartbeatMs: 10 }));
    const beacons = text.match(/: keep-alive\n\n/g) ?? [];
    expect(beacons.length).toBeGreaterThan(0);
    expect(text).toContain('event: message\ndata: {"step":1}\n\n');
    expect(text).toContain('event: message\ndata: {"step":2}\n\n');
    expect(text.indexOf('step":1')).toBeLessThan(text.indexOf(': keep-alive'));
    expect(text.indexOf(': keep-alive')).toBeLessThan(text.indexOf('step":2'));
  });

  it('closes the stream and disposes the iterator on AbortSignal', async () => {
    let returns = 0;
    let emitted = false;
    const signal = new AbortController();
    const iterable = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            if (returns === 0 && !emitted) {
              emitted = true;
              return { done: false as const, value: { data: 'start' } };
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
            return { done: true as const, value: undefined };
          },
          async return() {
            returns += 1;
            return { done: true as const, value: undefined };
          },
        };
      },
    };

    const reader = createAureliaEventStream(iterable, {
      signal: signal.signal,
      heartbeatMs: 0,
    }).getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);

    signal.abort();
    const afterAbort = await reader.read();
    expect(afterAbort.done).toBe(true);
    expect(returns).toBe(1);
  });

  it('decodes live frames on the client, filters events, and honours close', async () => {
    const app = new Hono();
    app.get(
      '/live',
      aureliaStream(
        async function* () {
          yield { data: { n: 1 }, event: 'tick', id: 'a' };
          yield { data: { ignored: true }, event: 'meta' };
          yield { data: { n: 2 }, event: 'tick', id: 'b' };
        },
        { heartbeatMs: 0 }
      )
    );
    const localFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      app.request(typeof input === 'string' ? input : input.toString(), init)) as typeof fetch;

    const received: LiveMessage[] = [];
    const controller = await subscribeLive('http://localhost/live', (message) => {
      received.push(message);
    }, { fetch: localFetch, event: 'tick' });

    await waitUntil(() => received.length === 2);
    expect(received).toEqual([
      { data: { n: 1 }, event: 'tick', id: 'a' },
      { data: { n: 2 }, event: 'tick', id: 'b' },
    ]);
    expect(controller.closed).toBe(true);
    controller.close();
  });

  it('aborts the underlying fetch when a live subscription is closed', async () => {
    let observedSignal: AbortSignal | undefined;
    const localFetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    }) as typeof fetch;

    const controller = createLiveStream('http://localhost/never', { fetch: localFetch });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(observedSignal?.aborted).toBe(false);

    controller.close();
    expect(controller.closed).toBe(true);
    expect(observedSignal?.aborted).toBe(true);
  });
});
