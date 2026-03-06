#!/usr/bin/env node
import { createCliApp } from './cli-app.js';

const app = createCliApp();
app.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
