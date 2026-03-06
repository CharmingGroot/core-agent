/**
 * PostgreSQL 스키마 정의 및 테이블 생성.
 * postgres-adapter.ts에서 사용.
 */

/** pg Pool 타입 (동적 import용) */
export interface PgPool {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

export interface PgModule {
  default: { Pool: new (config: Record<string, unknown>) => PgPool };
}

export async function loadPg(): Promise<PgModule> {
  try {
    return await import('pg') as unknown as PgModule;
  } catch {
    throw new Error(
      'pg package is required. Install with: npm install pg',
    );
  }
}

/** IF NOT EXISTS로 모든 governance 테이블 생성 */
export async function createPostgresTables(pool: PgPool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS governance_users (
      user_id VARCHAR(255) PRIMARY KEY,
      username VARCHAR(255) NOT NULL,
      metadata JSONB DEFAULT '{}'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS governance_roles (
      name VARCHAR(255) PRIMARY KEY,
      description TEXT NOT NULL DEFAULT '',
      allowed_skills JSONB NOT NULL DEFAULT '[]',
      allowed_tools JSONB NOT NULL DEFAULT '[]',
      policy JSONB NOT NULL DEFAULT '{}'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS governance_user_roles (
      user_id VARCHAR(255) REFERENCES governance_users(user_id) ON DELETE CASCADE,
      role_name VARCHAR(255) REFERENCES governance_roles(name) ON DELETE CASCADE,
      PRIMARY KEY (user_id, role_name)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS governance_user_domains (
      user_id VARCHAR(255) REFERENCES governance_users(user_id) ON DELETE CASCADE,
      domain_id VARCHAR(255) NOT NULL,
      PRIMARY KEY (user_id, domain_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS governance_audit_logs (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ NOT NULL,
      run_id VARCHAR(255) NOT NULL,
      agent_id VARCHAR(255) NOT NULL,
      domain_id VARCHAR(255),
      user_id VARCHAR(255) NOT NULL,
      action VARCHAR(50) NOT NULL,
      tool_name VARCHAR(255),
      skill_name VARCHAR(255),
      input JSONB,
      output JSONB,
      decision VARCHAR(20) NOT NULL,
      reason TEXT,
      data_classification VARCHAR(20),
      duration_ms INTEGER,
      token_usage JSONB
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS governance_approvals (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      tool_name VARCHAR(255) NOT NULL,
      action VARCHAR(255) NOT NULL,
      params JSONB NOT NULL DEFAULT '{}',
      reason TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      approved_by VARCHAR(255),
      status_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
