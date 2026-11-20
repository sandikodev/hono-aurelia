import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';

describe('examples/fullstack-ssr integration tests', () => {
  it('renders home page SSR with pre-rendered posts', async () => {
    const res = await app.request('http://localhost:3000/', {
      headers: { Accept: 'text/html' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Hono + Aurelia 2 SSR - Engineering Blog');
    expect(html).toContain('Hono + Aurelia 2 SSR Architecture');
    expect(html).toContain('id="__AURELIA_SSR_DATA__" type="application/json"');
  });

  it('serves JSON payload via content negotiation on the same route', async () => {
    const res = await app.request('http://localhost:3000/', {
      headers: { Accept: 'application/json' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const json = (await res.json()) as any;
    expect(json.component).toBe('home-page');
    expect(json.initialData.posts).toBeDefined();
    expect(json.initialData.posts.length).toBeGreaterThan(0);
  });

  it('evaluates dynamic title on post detail SSR', async () => {
    const res = await app.request('http://localhost:3000/posts/hono-aurelia-architecture', {
      headers: { Accept: 'text/html' },
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<title>Hono + Aurelia 2 SSR Architecture — Aurelia 2 SSR</title>');
    expect(html).toContain('Hono + Aurelia 2 SSR Architecture');
  });

  it('returns HTTP 404 status for non-existent post while rendering fallback UI', async () => {
    const res = await app.request('http://localhost:3000/posts/unknown-slug', {
      headers: { Accept: 'text/html' },
    });

    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('Article Not Found');
  });

  it('dispatches like mutation to co-located static action', async () => {
    const res = await app.request('http://localhost:3000/posts/hono-aurelia-architecture?_action=like', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(typeof body.claps).toBe('number');
  });

  it('guards protected dashboard route when token is missing', async () => {
    const res = await app.request('http://localhost:3000/dashboard');
    expect(res.status).toBe(401);
  });

  it('allows access to protected dashboard route with valid demo token', async () => {
    const res = await app.request('http://localhost:3000/dashboard?token=demo-token', {
      headers: { Accept: 'text/html' },
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Telemetry Dashboard');
    expect(html).toContain('Production Metrics');
  });

  it('serves static assets under /public/ and rewrites cleanly for Cloudflare ASSETS binding', async () => {
    // 1. Local Bun static asset serving
    const res = await app.request('http://localhost:3000/public/style.css');
    expect(res.status).toBe(200);
    const css = await res.text();
    expect(css).toContain('--primary');

    // 2. Direct static asset lookup
    const directRes = await app.request('http://localhost:3000/style.css');
    expect(directRes.status).toBe(200);

    // 3. Simulated Cloudflare ASSETS binding
    let requestedAssetPath = '';
    const mockAssets = {
      fetch: async (req: Request) => {
        const url = new URL(req.url);
        requestedAssetPath = url.pathname;
        return new Response('/* worker-mock-css */', {
          status: 200,
          headers: { 'Content-Type': 'text/css' },
        });
      },
    };

    const workerRes = await app.request(
      'http://localhost:3000/public/style.css',
      {},
      { ASSETS: mockAssets }
    );
    expect(workerRes.status).toBe(200);
    expect(requestedAssetPath).toBe('/style.css'); // Stripped '/public' prefix so Cloudflare finds ./public/style.css!
    const workerText = await workerRes.text();
    expect(workerText).toBe('/* worker-mock-css */');
  });
});
