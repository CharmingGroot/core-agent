import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Load .env file from project root and return key-value pairs */
export async function loadEnv(): Promise<Record<string, string>> {
  try {
    const envPath = join(process.cwd(), '.env');
    const content = await readFile(envPath, 'utf-8');
    const env: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}
