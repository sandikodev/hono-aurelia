import { describe, it, expect } from 'vitest';
import * as Root from '../src/index.js';
import * as Server from '../src/server.js';

describe('@hono/aurelia exports contract', () => {
  it('exposes thin Hono adapter functions at root (.)', () => {
    expect(Root.aurelia).toBeDefined();
    expect(Root.aureliaDefaults).toBeDefined();
    expect(Root.setAureliaDefaults).toBeDefined();
    expect(Root.serveAureliaAssets).toBeDefined();
    expect(Root.VERSION).toBe('1.0.0-alpha.1');

    // Strict boundary: adapter does NOT re-export raw SSR engine internals
    expect((Root as any).renderAurelia).toBeUndefined();
    expect((Root as any).renderToString).toBeUndefined();
    expect((Root as any).serializeState).toBeUndefined();
    expect((Root as any).createHtmlDocument).toBeUndefined();
    expect((Root as any).createClientHydrator).toBeUndefined();
    expect((Root as any).createAuthMiddleware).toBeUndefined();
    expect((Root as any).createAureliaRouteGroup).toBeUndefined();
  });

  it('exposes identical server adapter at ./server for ergonomic import parity', () => {
    expect(Server.aurelia).toBeDefined();
    expect(Server.aureliaDefaults).toBeDefined();
    expect(Server.setAureliaDefaults).toBeDefined();
    expect(Server.serveAureliaAssets).toBeDefined();
    expect((Server as any).renderAurelia).toBeUndefined();
  });
});
