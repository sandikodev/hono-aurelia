import { describe, it, expect } from 'bun:test';
import * as Root from '../src/index';
import * as Server from '../src/server';
import * as Client from '../src/client';
import * as Build from '../src/builder';

describe('@hono/aurelia exports contract', () => {
  it('exposes pure thin Hono adapter primitives at root (.) with zero node:fs build leaks', () => {
    expect(Root.aurelia).toBeDefined();
    expect(Root.aureliaAction).toBeDefined();
    expect(Root.aureliaDefaults).toBeDefined();
    expect(Root.aureliaLayout).toBeDefined();
    expect(Root.aureliaRenderer).toBe(Root.aureliaDefaults);
    expect(Root.VERSION).toBe('1.0.0-alpha.1');

    // Strict boundary: no SSR engine re-exports, no global mutable state, no Node build bundler at root
    const record = Root as Record<string, unknown>;
    expect(record.renderAurelia).toBeUndefined();
    expect(record.renderToString).toBeUndefined();
    expect(record.serializeState).toBeUndefined();
    expect(record.createHtmlDocument).toBeUndefined();
    expect(record.createClientHydrator).toBeUndefined();
    expect(record.setAureliaDefaults).toBeUndefined();
    expect(record.serveAureliaAssets).toBeUndefined();
    expect(record.buildClient).toBeUndefined();
    expect(record.buildWorker).toBeUndefined();
    expect(Build.buildClient).toBeDefined();
    expect(Build.buildWorker).toBeDefined();
  });

  it('exposes identical server adapter at ./server for import parity', () => {
    expect(Server.aurelia).toBe(Root.aurelia);
    expect(Server.aureliaAction).toBe(Root.aureliaAction);
    expect(Server.aureliaDefaults).toBe(Root.aureliaDefaults);
    expect(Server.aureliaLayout).toBe(Root.aureliaLayout);
    expect(Server.aureliaRenderer).toBe(Root.aureliaRenderer);
    expect((Server as Record<string, unknown>).buildClient).toBeUndefined();
  });

  it('exposes client hydration, navigator, and au-enhance primitives at ./client with zero Hono/server leakage', () => {
    expect(Client.createClientHydrator).toBeDefined();
    expect(Client.createClientNavigator).toBeDefined();
    expect(Client.AuEnhanceCustomAttribute).toBeDefined();
    expect(Client.EnhanceConfiguration).toBeDefined();
    expect(Client.hydrateFromServer).toBeDefined();
    expect(Client.isHydrationAvailable).toBeDefined();
    expect(Client.peekHydrationPayload).toBeDefined();
    expect(Client.clearHydration).toBeDefined();

    // Verify zero server adapter leakage into client bundle
    const clientRecord = Client as Record<string, unknown>;
    expect(clientRecord.aurelia).toBeUndefined();
    expect(clientRecord.aureliaAction).toBeUndefined();
    expect(clientRecord.aureliaDefaults).toBeUndefined();
    expect(clientRecord.aureliaLayout).toBeUndefined();
  });
});
