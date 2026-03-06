import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@cli-agent/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@cli-agent/agent': resolve(__dirname, '../../packages/agent/src/index.ts'),
      '@cli-agent/providers': resolve(__dirname, '../../packages/providers/src/index.ts'),
      '@cli-agent/tools': resolve(__dirname, '../../packages/tools/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.test.ts'],
    testTimeout: 60000,
  },
});
