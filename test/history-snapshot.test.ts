import { describe, it, expect, afterEach } from 'bun:test';
import { JSDOM } from 'jsdom';
import { Hono } from 'hono';
import { CustomElement, PLATFORM } from 'aurelia';
import { aurelia, aureliaDefaults } from '../src/adapter';
import { createClientNavigator, type HistorySnapshotHook } from '../src/client';

const domProps = [
  'window',
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLFormElement',
  'HTMLAnchorElement',
  'CustomEvent',
  'Event',
  'MouseEvent',
  'PopStateEvent',
  'SubmitEvent',
  'FormData',
  'HTMLTemplateElement',
] as const;

async function waitUntil(predicate: () => boolean, timeoutMs = 1500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for history snapshot state');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('@hono/aurelia/client history snapshots', () => {
  let dom: JSDOM | undefined;
  let nav: { dispose(): void } | null = null;
  const savedGlobals: Record<string, unknown> = {};
  const savedPlatform: Record<string, unknown> = {};
  let savedFetch: typeof globalThis.fetch;

  afterEach(() => {
    nav?.dispose();
    nav = null;
    globalThis.fetch = savedFetch;
    const p = PLATFORM as unknown as Record<string, unknown>;
    const g = globalThis as Record<string, unknown>;
    for (const prop of domProps) {
      if (savedGlobals[prop] !== undefined) g[prop] = savedGlobals[prop];
      else delete g[prop];
      if (savedPlatform[prop] !== undefined) p[prop] = savedPlatform[prop];
    }
    dom?.window.close();
    dom = undefined;
  });

  function installDom(html: string, url: string): void {
    dom = new JSDOM(html, { url });
    const p = PLATFORM as unknown as Record<string, unknown>;
    const g = globalThis as Record<string, unknown>;
    const w = dom.window as unknown as Record<string, unknown>;
    for (const prop of domProps) {
      savedGlobals[prop] = g[prop];
      savedPlatform[prop] = p[prop];
      if (w[prop] !== undefined) {
        g[prop] = w[prop];
        p[prop] = w[prop];
      }
    }
  }

  async function historyStep(direction: 'back' | 'forward'): Promise<void> {
    const current = dom!;
    await new Promise<void>((resolve) => {
      const listener = () => {
        current.window.removeEventListener('popstate', listener);
        resolve();
      };
      current.window.addEventListener('popstate', listener);
      current.window.history[direction]();
    });
  }

  it('restores form state per history entry on real back/forward navigation', async () => {
    savedFetch = globalThis.fetch;
    const restores: unknown[] = [];

    const sharedHook: HistorySnapshotHook = {
      capture: () => ({
        draft: (dom!.window.document.getElementById('draft') as HTMLInputElement | null)?.value ?? '',
        note: (dom!.window.document.getElementById('note') as HTMLInputElement | null)?.value ?? '',
      }),
      restore: (value) => {
        restores.push(value);
        const data = value as { draft?: string; note?: string };
        const draft = dom!.window.document.getElementById('draft') as HTMLInputElement | null;
        const note = dom!.window.document.getElementById('note') as HTMLInputElement | null;
        if (draft && typeof data.draft === 'string') draft.value = data.draft;
        if (note && typeof data.note === 'string') note.value = data.note;
      },
    };

    const HomePage = CustomElement.define(
      {
        name: 'snapshot-home-page',
        template: '<main><a id="to-detail" href="/detail">Detail</a><input id="draft"></main>',
      },
      class {
        readonly snapshot = sharedHook;
      }
    );
    const DetailPage = CustomElement.define(
      {
        name: 'snapshot-detail-page',
        template: '<article><a id="to-home" href="/">Home</a><input id="note"></article>',
      },
      class {
        readonly snapshot = sharedHook;
      }
    );

    const app = new Hono();
    app.use('*', aureliaDefaults({ dataEndpoint: true, preserveMarkers: false }));
    app.get('/', aurelia(HomePage));
    app.get('/detail', aurelia(DetailPage));

    installDom(await (await app.request('http://localhost/')).text(), 'http://localhost/');
    const localFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      app.request(typeof input === 'string' ? input : input.toString(), init)) as typeof fetch;
    globalThis.fetch = localFetch;

    nav = await createClientNavigator({ components: [HomePage, DetailPage], fetch: localFetch });
    expect(nav).not.toBeNull();

    const setInput = (id: string, value: string): void => {
      const input = dom!.window.document.getElementById(id) as HTMLInputElement;
      expect(input).not.toBeNull();
      input.value = value;
    };
    const valueOf = (id: string): string =>
      (dom!.window.document.getElementById(id) as HTMLInputElement | null)?.value ?? '';

    // Outgoing home entry stores its draft before the soft navigation.
    setInput('draft', 'unsent draft');
    dom!.window.document
      .getElementById('to-detail')!
      .dispatchEvent(new dom!.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await waitUntil(() => valueOf('note') !== '' || dom!.window.location.pathname === '/detail');
    await waitUntil(() => dom!.window.document.getElementById('note') !== null);

    // Outgoing detail entry stores its note.
    setInput('note', 'detail note');
    dom!.window.document
      .getElementById('to-home')!
      .dispatchEvent(new dom!.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await waitUntil(() => dom!.window.document.getElementById('draft') !== null);
    expect(valueOf('draft')).toBe('');

    const storageKeys: string[] = [];
    for (let i = 0; i < dom!.window.sessionStorage.length; i += 1) {
      storageKeys.push(dom!.window.sessionStorage.key(i) ?? '');
    }
    const stored = storageKeys
      .filter((key) => key.startsWith('aurelia:snapshot:'))
      .map((key) => JSON.parse(dom!.window.sessionStorage.getItem(key) ?? 'null'));
    expect(stored).toContainEqual({ draft: 'unsent draft', note: '' });
    expect(stored).toContainEqual({ draft: '', note: 'detail note' });

    // First back: the detail entry's note comes back.
    await historyStep('back');
    await waitUntil(() => valueOf('note') === 'detail note');
    expect(dom!.window.location.pathname).toBe('/detail');

    // Second back: the original home entry's draft comes back.
    await historyStep('back');
    await waitUntil(() => valueOf('draft') === 'unsent draft');
    expect(dom!.window.location.pathname).toBe('/');

    // Forward: the detail snapshot is applied again rather than reset.
    await historyStep('forward');
    await waitUntil(() => valueOf('note') === 'detail note');
    expect(restores.length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to navigator-level snapshot when the component exposes no hook', async () => {
    savedFetch = globalThis.fetch;
    let restored: unknown = null;
    const fallback: HistorySnapshotHook = {
      capture: () => ({
        draft: (dom!.window.document.getElementById('draft') as HTMLInputElement | null)?.value ?? '',
      }),
      restore: (value) => {
        restored = value;
        const input = dom!.window.document.getElementById('draft') as HTMLInputElement | null;
        if (input) input.value = (value as { draft: string }).draft;
      },
    };

    const HomePage = CustomElement.define(
      {
        name: 'fallback-home-page',
        template: '<main><a id="go" href="/other">Other</a><input id="draft"></main>',
      },
      class {}
    );
    const OtherPage = CustomElement.define(
      { name: 'fallback-other-page', template: '<p>Other</p>' },
      class {}
    );

    const app = new Hono();
    app.use('*', aureliaDefaults({ dataEndpoint: true, preserveMarkers: false }));
    app.get('/', aurelia(HomePage));
    app.get('/other', aurelia(OtherPage));

    installDom(await (await app.request('http://localhost/')).text(), 'http://localhost/');
    const localFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      app.request(typeof input === 'string' ? input : input.toString(), init)) as typeof fetch;
    globalThis.fetch = localFetch;

    nav = await createClientNavigator({
      components: [HomePage, OtherPage],
      fetch: localFetch,
      snapshot: fallback,
    });

    (dom!.window.document.getElementById('draft') as HTMLInputElement).value = 'fallback value';
    dom!.window.document
      .getElementById('go')!
      .dispatchEvent(new dom!.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await waitUntil(() => dom!.window.location.pathname === '/other');

    await historyStep('back');
    await waitUntil(() => restored !== null);
    expect(restored).toEqual({ draft: 'fallback value' });
    expect((dom!.window.document.getElementById('draft') as HTMLInputElement).value).toBe('fallback value');
  });
});
