import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@cli-agent/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@cli-agent/agent': resolve(__dirname, '../../packages/agent/src/index.ts'),
      '@cli-agent/providers': resolve(__dirname, '../../packages/providers/src/index.ts'),
      '@cli-agent/tools': resolve(__dirname, '../../packages/tools/src/index.ts'),
      '@core/types': resolve(__dirname, '../../core-packages/types/src/index.ts'),
      '@core/rule': resolve(__dirname, '../../core-packages/rule/src/index.ts'),
      '@core/governance': resolve(__dirname, '../../core-packages/governance/src/index.ts'),
      '@core/harness': resolve(__dirname, '../../core-packages/harness/src/index.ts'),
      '@core/skill': resolve(__dirname, '../../core-packages/skill/src/index.ts'),
      '@core/orchestrator': resolve(__dirname, '../../core-packages/orchestrator/src/index.ts'),
      '@core/context-engine': resolve(__dirname, '../../core-packages/context-engine/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.test.ts', 'tests/e2e/**/*.scenario.test.ts'],
    testTimeout: 60000,
  },
});
