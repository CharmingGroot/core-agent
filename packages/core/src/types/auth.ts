export type AuthType =
  | 'no-auth'
  | 'api-key'
  | 'oauth'
  | 'azure-ad'
  | 'aws-iam'
  | 'gcp-service-account'
  | 'credential-file';

export interface NoAuth {
  readonly type: 'no-auth';
}

export interface ApiKeyAuth {
  readonly type: 'api-key';
  readonly apiKey: string;
}

export interface OAuthAuth {
  readonly type: 'oauth';
  readonly clientId: string;
  readonly clientSecret: string;
  readonly tokenUrl: string;
  readonly scopes?: readonly string[];
  readonly accessToken?: string;
  readonly refreshToken?: string;
}

export interface AzureAdAuth {
  readonly type: 'azure-ad';
  readonly tenantId: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly accessToken?: string;
}

export interface AwsIamAuth {
  readonly type: 'aws-iam';
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly sessionToken?: string;
  readonly region: string;
  readonly profile?: string;
}

export interface GcpServiceAccountAuth {
  readonly type: 'gcp-service-account';
  readonly projectId: string;
  readonly keyFilePath?: string;
  readonly accessToken?: string;
}

export interface CredentialFileAuth {
  readonly type: 'credential-file';
  readonly filePath: string;
  readonly profile?: string;
}

export type AuthConfig =
  | NoAuth
  | ApiKeyAuth
  | OAuthAuth
  | AzureAdAuth
  | AwsIamAuth
  | GcpServiceAccountAuth
  | CredentialFileAuth;

export interface IAuthStrategy {
  readonly type: AuthType;
  resolve(config: AuthConfig): Promise<ResolvedCredential>;
  refresh?(config: AuthConfig): Promise<ResolvedCredential>;
}

export interface ResolvedCredential {
  readonly type: AuthType;
  readonly headers: Record<string, string>;
  readonly token?: string;
  readonly expiresAt?: Date;
}
