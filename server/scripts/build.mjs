// Bundles the server (and the shared package it imports) into a single ESM file: server/dist/main.js.
// Native and heavyweight runtime packages stay external and are loaded from node_modules.
import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const serverDir = fileURLToPath(new URL('..', import.meta.url));

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });

await build({
  absWorkingDir: serverDir,
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  // Everything from node_modules stays external except our own workspace package.
  packages: 'external',
  alias: { '@pcshop/shared': '../shared/src/index.ts' },
  define: { __PRODUCTION__: 'true' },
  logLevel: 'info',
});
