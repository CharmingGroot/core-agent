/**
 * Bundles the renderer process (React) using esbuild.
 *
 * - Entry point: src/renderer/index.tsx
 * - Output: dist/renderer/index.js
 * - Copies index.html to dist/renderer/
 * - Externalises 'electron' (only used in preload, not renderer)
 */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_RENDERER = resolve(ROOT, 'src', 'renderer');
const OUT_RENDERER = resolve(ROOT, 'dist', 'renderer');

mkdirSync(OUT_RENDERER, { recursive: true });

await build({
  entryPoints: [resolve(SRC_RENDERER, 'index.tsx')],
  bundle: true,
  platform: 'browser',
  target: 'chrome120',
  format: 'esm',
  outfile: resolve(OUT_RENDERER, 'index.js'),
  sourcemap: true,
  minify: false,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  external: ['electron'],
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
    '.css': 'css',
  },
});

// Copy the HTML entry point into dist/renderer/
copyFileSync(
  resolve(SRC_RENDERER, 'index.html'),
  resolve(OUT_RENDERER, 'index.html'),
);

console.log('[build-renderer] Renderer bundled to dist/renderer/');
