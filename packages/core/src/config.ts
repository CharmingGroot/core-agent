import { z } from 'zod';
import { ConfigError } from './errors/base-error.js';

export const providerConfigSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
  maxTokens: z.number().int().positive().default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
});

export type ProviderConfig = z.infer<typeof providerConfigSchema>;

export const sandboxConfigSchema = z.object({
  image: z.string().default('node:20-slim'),
  memoryLimitMb: z.number().int().positive().default(512),
  cpuLimit: z.number().positive().default(1),
  timeoutMs: z.number().int().positive().default(30000),
  workDir: z.string().default('/workspace'),
});

export type SandboxConfigInput = z.infer<typeof sandboxConfigSchema>;

export const agentConfigSchema = z.object({
  provider: providerConfigSchema,
  sandbox: sandboxConfigSchema.optional(),
  maxIterations: z.number().int().positive().default(50),
  systemPrompt: z.string().optional(),
  workingDirectory: z.string().default(process.cwd()),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;

export function parseConfig<T>(schema: z.ZodSchema<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new ConfigError(`Invalid configuration: ${messages}`);
  }
  return result.data;
}

export function parseAgentConfig(raw: unknown): AgentConfig {
  return parseConfig(agentConfigSchema, raw);
}
