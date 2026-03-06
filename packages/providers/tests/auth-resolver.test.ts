import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveAuth, extractToken } from '../src/auth/auth-resolver.js';

describe('extractToken', () => {
  it('should extract apiKey for api-key auth', () => {
    expect(extractToken({ type: 'api-key', apiKey: 'sk-123' })).toBe('sk-123');
  });

  it('should extract accessToken for oauth auth', () => {
    expect(extractToken({
      type: 'oauth',
      clientId: 'cid',
      clientSecret: 'cs',
      tokenUrl: 'https://auth.example.com/token',
      accessToken: 'at-123',
    })).toBe('at-123');
  });

  it('should return empty string for oauth without accessToken', () => {
    expect(extractToken({
      type: 'oauth',
      clientId: 'cid',
      clientSecret: 'cs',
      tokenUrl: 'https://auth.example.com/token',
    })).toBe('');
  });

  it('should extract accessToken for azure-ad auth', () => {
    expect(extractToken({
      type: 'azure-ad',
      tenantId: 'tid',
      clientId: 'cid',
      accessToken: 'az-token',
    })).toBe('az-token');
  });

  it('should extract accessKeyId for aws-iam auth', () => {
    expect(extractToken({
      type: 'aws-iam',
      region: 'us-east-1',
      accessKeyId: 'AKIA123',
    })).toBe('AKIA123');
  });

  it('should extract accessToken for gcp auth', () => {
    expect(extractToken({
      type: 'gcp-service-account',
      projectId: 'proj-1',
      accessToken: 'gcp-token',
    })).toBe('gcp-token');
  });

  it('should return empty string for credential-file', () => {
    expect(extractToken({
      type: 'credential-file',
      filePath: '/path/to/creds.json',
    })).toBe('');
  });
});

describe('resolveAuth', () => {
  it('should resolve api-key auth', async () => {
    const result = await resolveAuth({ type: 'api-key', apiKey: 'sk-test' });
    expect(result.type).toBe('api-key');
    expect(result.token).toBe('sk-test');
    expect(result.headers['Authorization']).toBe('Bearer sk-test');
  });

  it('should resolve oauth with existing accessToken', async () => {
    const result = await resolveAuth({
      type: 'oauth',
      clientId: 'cid',
      clientSecret: 'cs',
      tokenUrl: 'https://auth.example.com/token',
      accessToken: 'existing-token',
    });
    expect(result.type).toBe('oauth');
    expect(result.token).toBe('existing-token');
    expect(result.headers['Authorization']).toBe('Bearer existing-token');
  });

  it('should resolve azure-ad with existing accessToken', async () => {
    const result = await resolveAuth({
      type: 'azure-ad',
      tenantId: 'tid',
      clientId: 'cid',
      accessToken: 'az-token',
    });
    expect(result.type).toBe('azure-ad');
    expect(result.token).toBe('az-token');
  });

  it('should throw on azure-ad without accessToken or clientSecret', async () => {
    await expect(resolveAuth({
      type: 'azure-ad',
      tenantId: 'tid',
      clientId: 'cid',
    })).rejects.toThrow('Azure AD auth requires either accessToken or clientSecret');
  });

  it('should resolve aws-iam with credentials', async () => {
    const result = await resolveAuth({
      type: 'aws-iam',
      region: 'us-east-1',
      accessKeyId: 'AKIA123',
      secretAccessKey: 'secret',
      sessionToken: 'session',
    });
    expect(result.type).toBe('aws-iam');
    expect(result.headers['x-aws-access-key-id']).toBe('AKIA123');
    expect(result.headers['x-aws-region']).toBe('us-east-1');
    expect(result.headers['x-aws-session-token']).toBe('session');
  });

  it('should resolve aws-iam without explicit credentials', async () => {
    const result = await resolveAuth({
      type: 'aws-iam',
      region: 'us-west-2',
    });
    expect(result.type).toBe('aws-iam');
    expect(result.headers).toEqual({});
  });

  it('should resolve gcp with accessToken', async () => {
    const result = await resolveAuth({
      type: 'gcp-service-account',
      projectId: 'proj',
      accessToken: 'gcp-tok',
    });
    expect(result.type).toBe('gcp-service-account');
    expect(result.token).toBe('gcp-tok');
  });

  it('should resolve gcp without accessToken (ADC fallback)', async () => {
    const result = await resolveAuth({
      type: 'gcp-service-account',
      projectId: 'proj',
    });
    expect(result.type).toBe('gcp-service-account');
    expect(result.token).toBeUndefined();
  });

  it('should resolve credential-file auth', async () => {
    const { writeFile, mkdir, rm } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const dir = join(tmpdir(), 'cli-agent-test-creds');
    const filePath = join(dir, 'creds.json');

    await mkdir(dir, { recursive: true });
    await writeFile(filePath, JSON.stringify({
      default: { api_key: 'file-key-123' },
      staging: { token: 'staging-tok' },
    }));

    try {
      const result = await resolveAuth({
        type: 'credential-file',
        filePath,
      });
      expect(result.type).toBe('credential-file');
      expect(result.token).toBe('file-key-123');

      const result2 = await resolveAuth({
        type: 'credential-file',
        filePath,
        profile: 'staging',
      });
      expect(result2.token).toBe('staging-tok');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('should throw for missing credential file', async () => {
    await expect(resolveAuth({
      type: 'credential-file',
      filePath: '/nonexistent/path/creds.json',
    })).rejects.toThrow('Failed to read credential file');
  });

  it('should throw for missing profile in credential file', async () => {
    const { writeFile, mkdir, rm } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const dir = join(tmpdir(), 'cli-agent-test-creds-2');
    const filePath = join(dir, 'creds.json');

    await mkdir(dir, { recursive: true });
    await writeFile(filePath, JSON.stringify({ default: { api_key: 'key' } }));

    try {
      await expect(resolveAuth({
        type: 'credential-file',
        filePath,
        profile: 'nonexistent',
      })).rejects.toThrow("Profile 'nonexistent' not found");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
