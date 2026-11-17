import { describe, it, expect } from 'vitest';
import * as Root from '../src/index.js';
import * as Server from '../src/server.js';
import * as Client from '../src/client.js';

describe('@hono/aurelia exports contract', () => {
  it('exposes core SSR and Hono adapter functions at root (.)', () => {
    expect(Root.aurelia).toBeDefined();
    expect(Root.createAuthMiddleware).toBeDefined();
    expect(Root.createAureliaRouteGroup).toBeDefined();
    expect(Root.renderAurelia).toBeDefined();
    expect(Root.renderToString).toBeDefined();
    expect(Root.serializeState).toBeDefined();
    expect(Root.createHtmlDocument).toBeDefined();
    expect(Root.hydrateFromServer).toBeDefined();
    expect(Root.createClientHydrator).toBeDefined();
    expect(Root.IRequestContext).toBeDefined();
    expect(Root.VERSION).toBe('1.0.0-alpha.1');
  });

  it('exposes server primitives and adapter at ./server', () => {
    expect(Server.aurelia).toBeDefined();
    expect(Server.createAuthMiddleware).toBeDefined();
    expect(Server.createAureliaRouteGroup).toBeDefined();
    expect(Server.renderAurelia).toBeDefined();
    expect(Server.renderToString).toBeDefined();
    expect(Server.serializeState).toBeDefined();
    expect(Server.createHtmlDocument).toBeDefined();
    expect(Server.IRequestContext).toBeDefined();
  });

  it('exposes lightweight hydration at ./client without server DOM leaks', () => {
    expect(Client.hydrateFromServer).toBeDefined();
    expect(Client.createClientHydrator).toBeDefined();
    expect(Client.isHydrationAvailable).toBeDefined();
    expect(Client.peekHydrationPayload).toBeDefined();
    expect(Client.clearHydration).toBeDefined();
    expect(Client.HydrationCache).toBeDefined();
    expect(Client.hydrationCache).toBeDefined();
    expect(Client.IRequestContext).toBeDefined();
    // Verify server symbols are NOT present on client
    expect((Client as any).renderAurelia).toBeUndefined();
    expect((Client as any).createHtmlDocument).toBeUndefined();
  });
});
