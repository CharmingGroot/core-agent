import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@cli-agent/core': resolve(__dirname, '../core/src/index.ts'),
      '@cli-agent/providers': resolve(__dirname, '../providers/src/index.ts'),
      '@cli-agent/tools': resolve(__dirname, '../tools/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
