import { z } from 'zod';
import { ConfigError } from './errors/base-error.js';

const noAuthSchema = z.object({
  type: z.literal('no-auth'),
});

const apiKeyAuthSchema = z.object({
  type: z.literal('api-key'),
  apiKey: z.string().min(1),
});

const oauthAuthSchema = z.object({
  type: z.literal('oauth'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  tokenUrl: z.string().url(),
  scopes: z.array(z.string()).optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
});

const azureAdAuthSchema = z.object({
  type: z.literal('azure-ad'),
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().optional(),
  accessToken: z.string().optional(),
});

const awsIamAuthSchema = z.object({
  type: z.literal('aws-iam'),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  sessionToken: z.string().optional(),
  region: z.string().min(1),
  profile: z.string().optional(),
});

const gcpServiceAccountAuthSchema = z.object({
  type: z.literal('gcp-service-account'),
  projectId: z.string().min(1),
  keyFilePath: z.string().optional(),
  accessToken: z.string().optional(),
});

const credentialFileAuthSchema = z.object({
  type: z.literal('credential-file'),
  filePath: z.string().min(1),
  profile: z.string().optional(),
});

export const authConfigSchema = z.discriminatedUnion('type', [
  noAuthSchema,
  apiKeyAuthSchema,
  oauthAuthSchema,
  azureAdAuthSchema,
  awsIamAuthSchema,
  gcpServiceAccountAuthSchema,
  credentialFileAuthSchema,
]);

export const providerConfigSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1),
  auth: authConfigSchema,
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

export function parseConfig<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown): T {
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

/**
 * Shorthand: convert a plain apiKey string to an AuthConfig object.
 * Useful for backward-compatible CLI usage.
 */
export function apiKeyAuth(apiKey: string): { type: 'api-key'; apiKey: string } {
  return { type: 'api-key', apiKey };
}

export function noAuth(): { type: 'no-auth' } {
  return { type: 'no-auth' };
}
