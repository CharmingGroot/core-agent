#!/usr/bin/env node
import { createCliApp } from './cli-app.js';

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Unhandled promise rejection:', reason instanceof Error ? reason.message : String(reason));
  process.exit(1);
});

const app = createCliApp();
app.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
