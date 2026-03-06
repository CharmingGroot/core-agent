import type { AuthConfig, ResolvedCredential } from '@cli-agent/core';
import { ProviderError } from '@cli-agent/core';

/**
 * Synchronously extract a token/apiKey from an AuthConfig.
 * For auth types that require async token exchange (OAuth client_credentials, Azure AD),
 * the caller should use resolveAuth() first and pass the accessToken.
 */
export function extractToken(auth: AuthConfig): string {
  switch (auth.type) {
    case 'api-key':
      return auth.apiKey;
    case 'oauth':
      return auth.accessToken ?? '';
    case 'azure-ad':
      return auth.accessToken ?? '';
    case 'aws-iam':
      return auth.accessKeyId ?? '';
    case 'gcp-service-account':
      return auth.accessToken ?? '';
    case 'credential-file':
      return '';
  }
}

export async function resolveAuth(auth: AuthConfig): Promise<ResolvedCredential> {
  switch (auth.type) {
    case 'api-key':
      return resolveApiKey(auth);
    case 'oauth':
      return resolveOAuth(auth);
    case 'azure-ad':
      return resolveAzureAd(auth);
    case 'aws-iam':
      return resolveAwsIam(auth);
    case 'gcp-service-account':
      return resolveGcp(auth);
    case 'credential-file':
      return resolveCredentialFile(auth);
    default:
      throw new ProviderError(`Unsupported auth type: ${(auth as AuthConfig).type}`);
  }
}

function resolveApiKey(auth: { type: 'api-key'; apiKey: string }): ResolvedCredential {
  return {
    type: 'api-key',
    headers: { Authorization: `Bearer ${auth.apiKey}` },
    token: auth.apiKey,
  };
}

async function resolveOAuth(auth: {
  type: 'oauth';
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  scopes?: readonly string[];
  accessToken?: string;
  refreshToken?: string;
}): Promise<ResolvedCredential> {
  // If we already have a valid access token, use it
  if (auth.accessToken) {
    return {
      type: 'oauth',
      headers: { Authorization: `Bearer ${auth.accessToken}` },
      token: auth.accessToken,
    };
  }

  // Client credentials flow
  const params = new URLSearchParams({
    grant_type: auth.refreshToken ? 'refresh_token' : 'client_credentials',
    client_id: auth.clientId,
    client_secret: auth.clientSecret,
  });

  if (auth.refreshToken) {
    params.set('refresh_token', auth.refreshToken);
  }
  if (auth.scopes && auth.scopes.length > 0) {
    params.set('scope', auth.scopes.join(' '));
  }

  const response = await fetch(auth.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ProviderError(`OAuth token request failed (${response.status}): ${body}`);
  }

  const data = await response.json() as { access_token: string; expires_in?: number };
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : undefined;

  return {
    type: 'oauth',
    headers: { Authorization: `Bearer ${data.access_token}` },
    token: data.access_token,
    expiresAt,
  };
}

async function resolveAzureAd(auth: {
  type: 'azure-ad';
  tenantId: string;
  clientId: string;
  clientSecret?: string;
  accessToken?: string;
}): Promise<ResolvedCredential> {
  if (auth.accessToken) {
    return {
      type: 'azure-ad',
      headers: { Authorization: `Bearer ${auth.accessToken}` },
      token: auth.accessToken,
    };
  }

  if (!auth.clientSecret) {
    throw new ProviderError('Azure AD auth requires either accessToken or clientSecret');
  }

  const tokenUrl = `https://login.microsoftonline.com/${auth.tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: auth.clientId,
    client_secret: auth.clientSecret,
    scope: 'https://cognitiveservices.azure.com/.default',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ProviderError(`Azure AD token request failed (${response.status}): ${body}`);
  }

  const data = await response.json() as { access_token: string; expires_in?: number };
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : undefined;

  return {
    type: 'azure-ad',
    headers: {
      Authorization: `Bearer ${data.access_token}`,
      'api-key': data.access_token,
    },
    token: data.access_token,
    expiresAt,
  };
}

async function resolveAwsIam(auth: {
  type: 'aws-iam';
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  region: string;
  profile?: string;
}): Promise<ResolvedCredential> {
  // If explicit credentials provided, use them directly
  // Real AWS Bedrock signing would use AWS SDK's SigV4
  // This provides the credential structure for consumers to use
  const headers: Record<string, string> = {};

  if (auth.accessKeyId && auth.secretAccessKey) {
    headers['x-aws-access-key-id'] = auth.accessKeyId;
    headers['x-aws-region'] = auth.region;
    if (auth.sessionToken) {
      headers['x-aws-session-token'] = auth.sessionToken;
    }
  }

  return {
    type: 'aws-iam',
    headers,
    token: auth.accessKeyId,
  };
}

async function resolveGcp(auth: {
  type: 'gcp-service-account';
  projectId: string;
  keyFilePath?: string;
  accessToken?: string;
}): Promise<ResolvedCredential> {
  if (auth.accessToken) {
    return {
      type: 'gcp-service-account',
      headers: { Authorization: `Bearer ${auth.accessToken}` },
      token: auth.accessToken,
    };
  }

  // When keyFilePath is provided, consumers should use Google Auth Library
  // This returns a placeholder that signals ADC should be used
  return {
    type: 'gcp-service-account',
    headers: {},
    token: undefined,
  };
}

async function resolveCredentialFile(auth: {
  type: 'credential-file';
  filePath: string;
  profile?: string;
}): Promise<ResolvedCredential> {
  const { readFile } = await import('node:fs/promises');
  let content: string;

  try {
    content = await readFile(auth.filePath, 'utf-8');
  } catch (error) {
    throw new ProviderError(
      `Failed to read credential file: ${auth.filePath}`,
      error instanceof Error ? error : undefined
    );
  }

  try {
    const credentials = JSON.parse(content) as Record<string, Record<string, string>>;
    const profile = auth.profile ?? 'default';
    const entry = credentials[profile];

    if (!entry) {
      throw new ProviderError(`Profile '${profile}' not found in credential file`);
    }

    const apiKey = entry['api_key'] ?? entry['apiKey'] ?? entry['token'];
    if (!apiKey) {
      throw new ProviderError(`No api_key/apiKey/token found in profile '${profile}'`);
    }

    return {
      type: 'credential-file',
      headers: { Authorization: `Bearer ${apiKey}` },
      token: apiKey,
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      `Failed to parse credential file: ${auth.filePath}`,
      error instanceof Error ? error : undefined
    );
  }
}
