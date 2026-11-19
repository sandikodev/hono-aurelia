/**
 * @hono/aurelia Fullstack Build Engine
 *
 * Universal compilation and bundling toolchain for Aurelia 2 on Hono:
 * - Zero-config auto-discovery client hydration bundling
 * - Cloudflare Worker / Edge isolate bundling with automatic JSDOM stubbing
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BunPlugin } from 'bun';

export interface ClientBuildOptions {
  /**
   * Root directory of the application project.
   * Defaults to process.cwd().
   */
  root?: string;
  /**
   * Relative path to pages directory.
   * Defaults to src/pages.
   */
  pagesDir?: string;
  /**
   * Relative path to output directory for client assets.
   * Defaults to public.
   */
  outdir?: string;
  /**
   * Output file name.
   * Defaults to client.js.
   */
  naming?: string;
  /**
   * Whether to minify client bundle.
   * Defaults to true in production.
   */
  minify?: boolean;
}

export interface WorkerBuildOptions {
  /**
   * Root directory of the application project.
   * Defaults to process.cwd().
   */
  root?: string;
  /**
   * Relative path to server entrypoint.
   * Defaults to src/index.ts.
   */
  entrypoint?: string;
  /**
   * Relative path to output directory.
   * Defaults to dist.
   */
  outdir?: string;
  /**
   * Output file name.
   * Defaults to worker.js.
   */
  naming?: string;
  /**
   * Whether to minify worker bundle.
   * Defaults to true.
   */
  minify?: boolean;
}

export interface BuildOutputStats {
  success: boolean;
  rawBytes: number;
  gzipBytes: number;
  outputPath: string;
  durationMs: number;
}

/**
 * Auto-discovery Virtual Client Hydration Plugin
 * Automatically discovers all Aurelia 2 page components under the pages directory,
 * synthesizing the client hydration bootstrap in memory with zero manual glue code.
 */
export function createVirtualClientPlugin(root: string, pagesDir: string): BunPlugin {
  return {
    name: 'aurelia-virtual-client',
    setup(b) {
      b.onResolve({ filter: /^virtual:aurelia-client$/ }, () => ({
        path: resolve(root, '.virtual-client-entry.ts'),
      }));
      b.onLoad({ filter: /\.virtual-client-entry\.ts$/ }, async () => {
        const globPattern = `${pagesDir}/**/*.{ts,aux}`;
        const glob = new Bun.Glob(globPattern);
        const files = (await Array.fromAsync(glob.scan({ cwd: root })))
          .filter((f) => !f.endsWith('.d.ts'))
          .sort();
        const imports = files
          .map((f, i) => `import * as _P${i} from '${resolve(root, f)}';`)
          .join('\n');
        const arrays = files.map((_, i) => `...Object.values(_P${i})`).join(', ');

        const contents = [
          'import { createClientHydrator } from "@aureliajs/ssr/client";',
          imports,
          `const components = [${arrays}].filter((c) => typeof c === "function");`,
          'createClientHydrator({ components });',
        ].join('\n');

        return { contents, loader: 'ts' };
      });
    },
  };
}

/**
 * Stub JSDOM in Cloudflare Worker isolate.
 * Cloudflare Workers runtime (workerd) uses LinkeDOM and lacks Node vm module.
 * Stubbing JSDOM eliminates transitive dependencies like whatwg-url and prevents
 * unenv shim warnings during Wrangler deployment.
 */
export function stubJsdomPlugin(): BunPlugin {
  return {
    name: 'stub-jsdom-worker',
    setup(builder) {
      builder.onResolve({ filter: /^jsdom$/ }, () => ({
        path: 'jsdom-stub',
        namespace: 'jsdom-stub',
      }));
      builder.onLoad({ filter: /.*/, namespace: 'jsdom-stub' }, () => ({
        contents:
          'export class JSDOM { constructor() { throw new Error("JSDOM is not supported in Cloudflare Workers — LinkeDOM is active."); } }',
        loader: 'js',
      }));
    },
  };
}

/**
 * Compile client hydration bundle with Bun.build.
 * Supports zero-config page auto-discovery or opt-in src/client.ts customization.
 */
export async function buildClient(options: ClientBuildOptions = {}): Promise<BuildOutputStats> {
  const root = options.root ? resolve(options.root) : process.cwd();
  const pagesDir = options.pagesDir ?? 'src/pages';
  const outdir = resolve(root, options.outdir ?? 'public');
  const naming = options.naming ?? 'client.js';
  const minify = options.minify ?? process.env.NODE_ENV === 'production';

  const startTime = performance.now();

  const customClientPath = resolve(root, 'src/client.ts');
  const hasCustomClient = existsSync(customClientPath);
  const entrypoint = hasCustomClient ? customClientPath : 'virtual:aurelia-client';
  const plugins = hasCustomClient ? [] : [createVirtualClientPlugin(root, pagesDir)];

  const result = await Bun.build({
    entrypoints: [entrypoint],
    root,
    outdir,
    naming,
    plugins,
    loader: { '.html': 'text' },
    target: 'browser',
    conditions: ['browser', 'module', 'import', 'default'],
    format: 'esm',
    minify,
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    },
  });

  if (!result.success) {
    throw new AggregateError(result.logs, `Client build failed (${naming})`);
  }

  const output = result.outputs[0];
  const code = await output.text();
  const buffer = Buffer.from(code);
  const durationMs = Number((performance.now() - startTime).toFixed(1));

  return {
    success: true,
    rawBytes: buffer.byteLength,
    gzipBytes: Bun.gzipSync(buffer).byteLength,
    outputPath: resolve(outdir, naming),
    durationMs,
  };
}

/**
 * Compile Cloudflare Worker / Edge server bundle with LinkeDOM optimization.
 */
export async function buildWorker(options: WorkerBuildOptions = {}): Promise<BuildOutputStats> {
  const root = options.root ? resolve(options.root) : process.cwd();
  const entrypoint = resolve(root, options.entrypoint ?? 'src/index.ts');
  const outdir = resolve(root, options.outdir ?? 'dist');
  const naming = options.naming ?? 'worker.js';
  const minify = options.minify ?? true;

  const startTime = performance.now();

  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir,
    naming,
    target: 'browser',
    format: 'esm',
    loader: { '.html': 'text' },
    plugins: [stubJsdomPlugin()],
    external: ['cloudflare:*', 'node:*', 'hono/bun'],
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env.WORKER': JSON.stringify('true'),
    },
    minify,
  });

  if (!result.success) {
    throw new AggregateError(result.logs, `Worker build failed (${naming})`);
  }

  const output = result.outputs[0];
  const code = await output.text();
  const buffer = Buffer.from(code);
  const durationMs = Number((performance.now() - startTime).toFixed(1));

  return {
    success: true,
    rawBytes: buffer.byteLength,
    gzipBytes: Bun.gzipSync(buffer).byteLength,
    outputPath: resolve(outdir, naming),
    durationMs,
  };
}
