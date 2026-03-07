/**
 * Full build script for @cli-agent/ui Electron app.
 *
 * Steps:
 *   1. Bundle main process (TypeScript -> CJS .cjs) via esbuild
 *   2. Bundle renderer process (React TSX -> ESM bundle) via esbuild
 */
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ── Main process ── */
console.log('[build] Bundling main process...');
await build({
  entryPoints: [
    resolve(ROOT, 'src/main/main.ts'),
    resolve(ROOT, 'src/main/preload.ts'),
  ],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outdir: resolve(ROOT, 'dist/main'),
  outExtension: { '.js': '.cjs' },
  external: ['electron'],
  sourcemap: true,
});

/* ── Renderer process ── */
console.log('[build] Bundling renderer...');
execSync('node scripts/build-renderer.mjs', { cwd: ROOT, stdio: 'inherit' });

console.log('[build] Done.');
