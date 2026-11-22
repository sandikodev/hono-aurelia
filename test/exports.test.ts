import { describe, it, expect } from 'bun:test';
import * as Root from '../src/index.js';
import * as Server from '../src/server.js';
import * as Client from '../src/client.js';

describe('@hono/aurelia exports contract', () => {
  it('exposes pure thin Hono adapter primitives at root (.)', () => {
    expect(Root.aurelia).toBeDefined();
    expect(Root.aureliaAction).toBeDefined();
    expect(Root.aureliaDefaults).toBeDefined();
    expect(Root.aureliaRenderer).toBe(Root.aureliaDefaults);
    expect(Root.VERSION).toBe('1.0.0-alpha.1');

    // Strict boundary: no SSR engine re-exports at root, no global mutable state, no static file server
    const record = Root as Record<string, unknown>;
    expect(record.renderAurelia).toBeUndefined();
    expect(record.renderToString).toBeUndefined();
    expect(record.serializeState).toBeUndefined();
    expect(record.createHtmlDocument).toBeUndefined();
    expect(record.createClientHydrator).toBeUndefined();
    expect(record.setAureliaDefaults).toBeUndefined();
    expect(record.serveAureliaAssets).toBeUndefined();
  });

  it('exposes identical server adapter at ./server for import parity', () => {
    expect(Server.aurelia).toBe(Root.aurelia);
    expect(Server.aureliaAction).toBe(Root.aureliaAction);
    expect(Server.aureliaDefaults).toBe(Root.aureliaDefaults);
    expect(Server.aureliaRenderer).toBe(Root.aureliaRenderer);
  });

  it('exposes client hydration primitives at ./client with zero Hono/server leakage', () => {
    expect(Client.createClientHydrator).toBeDefined();
    expect(Client.hydrateFromServer).toBeDefined();
    expect(Client.isHydrationAvailable).toBeDefined();
    expect(Client.peekHydrationPayload).toBeDefined();
    expect(Client.clearHydration).toBeDefined();

    // Verify zero server adapter leakage into client bundle
    const clientRecord = Client as Record<string, unknown>;
    expect(clientRecord.aurelia).toBeUndefined();
    expect(clientRecord.aureliaAction).toBeUndefined();
    expect(clientRecord.aureliaDefaults).toBeUndefined();
  });
});
