[< README](../README.md)

# Chamelion - 인증 (Auth) 시스템

API 키 외에 다양한 인증 방식을 지원합니다. `ProviderConfig.auth` 필드에 discriminated union으로 설정합니다.

---

## 지원하는 인증 타입

| 타입 | 설명 | 주요 필드 |
|------|------|-----------|
| `no-auth` | 인증 불필요 (로컬 vLLM, Ollama 등) | 없음 |
| `api-key` | 일반 API 키 | `apiKey` |
| `oauth` | OAuth 2.0 (Client Credentials / Refresh Token) | `clientId`, `clientSecret`, `tokenUrl` |
| `azure-ad` | Azure Active Directory | `tenantId`, `clientId`, `clientSecret` |
| `aws-iam` | AWS IAM (Bedrock용) | `region`, `accessKeyId`, `secretAccessKey` |
| `gcp-service-account` | Google Cloud 서비스 계정 | `projectId`, `keyFilePath` |
| `credential-file` | JSON 자격 증명 파일 | `filePath`, `profile` |

---

## 인증 설정 예시

```typescript
// API Key (가장 간단)
auth: { type: 'api-key', apiKey: 'sk-...' }

// OAuth 2.0 Client Credentials
auth: {
  type: 'oauth',
  clientId: 'my-client-id',
  clientSecret: 'my-secret',
  tokenUrl: 'https://auth.example.com/oauth/token',
  scopes: ['api.read', 'api.write'],
}

// Azure AD
auth: {
  type: 'azure-ad',
  tenantId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  clientId: 'my-app-id',
  clientSecret: 'my-client-secret',
}

// AWS IAM (Bedrock)
auth: {
  type: 'aws-iam',
  region: 'us-east-1',
  accessKeyId: 'AKIA...',
  secretAccessKey: '...',
}

// Credential File
auth: {
  type: 'credential-file',
  filePath: '~/.config/cli-agent/credentials.json',
  profile: 'production',
}
```

---

## resolveAuth 함수

비동기 인증이 필요한 경우 (OAuth 토큰 교환, Azure AD 토큰 발급 등) `resolveAuth()`를 사용합니다:

```typescript
import { resolveAuth } from '@cli-agent/providers';

const credential = await resolveAuth({
  type: 'oauth',
  clientId: '...',
  clientSecret: '...',
  tokenUrl: 'https://auth.example.com/token',
});

// credential.token -> 발급된 access_token
// credential.headers -> { Authorization: 'Bearer ...' }
// credential.expiresAt -> 만료 시간 (Date | undefined)
```
