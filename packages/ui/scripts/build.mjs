/**
 * Full build script for @cli-agent/ui Electron app.
 *
 * Steps:
 *   1. Compile main process (TypeScript -> CommonJS) via tsc
 *   2. Bundle renderer process (React TSX -> ESM bundle) via esbuild
 */
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, label) {
  console.log(`[build] ${label}...`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

run('npx tsc -p tsconfig.json', 'Compiling main process');
run('node scripts/build-renderer.mjs', 'Bundling renderer');

console.log('[build] Done.');
