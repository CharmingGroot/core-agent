// GovernedPolicy - DB 기반 RBAC 구현체
export { GovernedPolicy } from './governed-policy.js';

// Admin API - 관리자 작업 파사드
export { GovernanceAdmin } from './admin-api.js';
export type { AuditReport } from './admin-api.js';

// In-Memory Store - 테스트 및 standalone 용
export { InMemoryGovernanceStore } from './stores/in-memory-store.js';

// DB Adapters - 동적 import로 드라이버 로드
export { PostgresGovernanceStore } from './adapters/postgres-adapter.js';
export type { PostgresConfig } from './adapters/postgres-adapter.js';

export { MysqlGovernanceStore } from './adapters/mysql-adapter.js';
export type { MysqlConfig } from './adapters/mysql-adapter.js';

export { MongoGovernanceStore } from './adapters/mongodb-adapter.js';
export type { MongoConfig } from './adapters/mongodb-adapter.js';
