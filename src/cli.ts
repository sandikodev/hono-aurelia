#!/usr/bin/env bun
/**
 * @hono/aurelia CLI
 *
 * Official compilation and bundling command-line interface for Aurelia 2 on Hono.
 * Usage:
 *   hono-aurelia build             # Builds client hydration bundle (zero-config)
 *   hono-aurelia build:worker      # Builds Cloudflare Worker bundle
 *   hono-aurelia build --worker    # Flag alias for worker build
 *   hono-aurelia build --all       # Builds both client and worker
 */

import { buildClient, buildWorker } from './builder.js';

export async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'build';
  const isWorker = args.includes('--worker') || args.includes('-w') || command === 'build:worker';
  const isAll = args.includes('--all') || command === 'build:all';

  if (command === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`
@hono/aurelia CLI — Build Toolchain for Aurelia 2 + Hono Fullstack

Commands:
  build             Compile client hydration bundle from src/pages (default)
  build:worker      Compile Cloudflare Worker bundle from src/index.ts
  build:all         Compile both client bundle and worker isolate

Options:
  --worker, -w      Target Cloudflare Workers isolate
  --all             Build both client and worker
  --help, -h        Show this help message
`);
    return;
  }

  if (isAll) {
    console.log('⚡ Building Aurelia 2 + Hono Client and Worker bundles...');
    const client = await buildClient();
    console.log(`✅ Client bundle ready at ${client.outputPath} (${(client.rawBytes / 1024).toFixed(2)} KB) in ${client.durationMs}ms`);
    const worker = await buildWorker();
    console.log(`✅ Worker bundle ready at ${worker.outputPath} (${(worker.rawBytes / 1024).toFixed(2)} KB) in ${worker.durationMs}ms`);
    return;
  }

  if (isWorker) {
    console.log('⚡ Compiling Aurelia 2 SSR Cloudflare Worker isolate...');
    const worker = await buildWorker();
    console.log(`✅ Cloudflare Worker ready at ${worker.outputPath} (${(worker.rawBytes / 1024).toFixed(2)} KB) in ${worker.durationMs}ms`);
    return;
  }

  console.log('⚡ Compiling Aurelia 2 Client Hydration bundle...');
  const client = await buildClient();
  console.log(`✅ Client bundle ready at ${client.outputPath} (${(client.rawBytes / 1024).toFixed(2)} KB raw, ${(client.gzipBytes / 1024).toFixed(2)} KB gz) in ${client.durationMs}ms`);
}

if (import.meta.main) {
  runCli().catch((err) => {
    console.error('❌ Build failed:', err);
    process.exit(1);
  });
}
