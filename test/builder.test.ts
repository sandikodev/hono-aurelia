import { describe, it, expect } from 'bun:test';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { buildClient, buildWorker } from '../src/builder.js';

describe('@hono/aurelia Fullstack Build Engine', () => {
  const exampleRoot = resolve(import.meta.dir, '../../../examples/fullstack-ssr');

  it('compiles client hydration bundle via auto-discovery without src/client.ts', async () => {
    // Assert src/client.ts does NOT exist in example scaffold
    expect(existsSync(resolve(exampleRoot, 'src/client.ts'))).toBe(false);

    const result = await buildClient({
      root: exampleRoot,
      pagesDir: 'src/pages',
      outdir: 'public',
      naming: 'client.js',
    });

    expect(result.success).toBe(true);
    expect(result.rawBytes).toBeGreaterThan(100_000);
    expect(result.gzipBytes).toBeGreaterThan(20_000);
    expect(existsSync(result.outputPath)).toBe(true);
  });

  it('compiles Cloudflare Worker bundle with LinkeDOM optimization', async () => {
    const result = await buildWorker({
      root: exampleRoot,
      entrypoint: 'src/index.ts',
      outdir: 'dist',
      naming: 'worker.js',
    });

    expect(result.success).toBe(true);
    expect(result.rawBytes).toBeGreaterThan(200_000);
    expect(existsSync(result.outputPath)).toBe(true);
  });
});
