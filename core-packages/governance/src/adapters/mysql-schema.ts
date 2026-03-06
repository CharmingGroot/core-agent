/**
 * MySQL/MariaDB 스키마 정의 및 테이블 생성.
 * mysql-adapter.ts에서 사용.
 */

/** mysql2/promise Pool 타입 (동적 import용) */
export interface MysqlPool {
  execute(sql: string, values?: readonly unknown[]): Promise<[MysqlRow[], unknown]>;
  end(): Promise<void>;
}

export type MysqlRow = Record<string, unknown>;

export interface MysqlModule {
  createPool(config: Record<string, unknown>): MysqlPool;
}

export async function loadMysql(): Promise<MysqlModule> {
  try {
    return await import('mysql2/promise') as unknown as MysqlModule;
  } catch {
    throw new Error(
      'mysql2 package is required. Install with: npm install mysql2',
    );
  }
}

/** IF NOT EXISTS로 모든 governance 테이블 생성 */
export async function createMysqlTables(pool: MysqlPool): Promise<void> {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS governance_users (
      user_id VARCHAR(255) PRIMARY KEY,
      username VARCHAR(255) NOT NULL,
      metadata JSON DEFAULT NULL
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS governance_roles (
      name VARCHAR(255) PRIMARY KEY,
      description TEXT NOT NULL,
      allowed_skills JSON NOT NULL,
      allowed_tools JSON NOT NULL,
      policy JSON NOT NULL
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS governance_user_roles (
      user_id VARCHAR(255),
      role_name VARCHAR(255),
      PRIMARY KEY (user_id, role_name),
      FOREIGN KEY (user_id) REFERENCES governance_users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (role_name) REFERENCES governance_roles(name) ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS governance_user_domains (
      user_id VARCHAR(255),
      domain_id VARCHAR(255) NOT NULL,
      PRIMARY KEY (user_id, domain_id),
      FOREIGN KEY (user_id) REFERENCES governance_users(user_id) ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS governance_audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      timestamp DATETIME(3) NOT NULL,
      run_id VARCHAR(255) NOT NULL,
      agent_id VARCHAR(255) NOT NULL,
      domain_id VARCHAR(255) DEFAULT NULL,
      user_id VARCHAR(255) NOT NULL,
      action VARCHAR(50) NOT NULL,
      tool_name VARCHAR(255) DEFAULT NULL,
      skill_name VARCHAR(255) DEFAULT NULL,
      input JSON DEFAULT NULL,
      output_data JSON DEFAULT NULL,
      decision VARCHAR(20) NOT NULL,
      reason TEXT DEFAULT NULL,
      data_classification VARCHAR(20) DEFAULT NULL,
      duration_ms INT DEFAULT NULL,
      token_usage JSON DEFAULT NULL
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS governance_approvals (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      tool_name VARCHAR(255) NOT NULL,
      action VARCHAR(255) NOT NULL,
      params JSON NOT NULL,
      reason TEXT DEFAULT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      approved_by VARCHAR(255) DEFAULT NULL,
      status_reason TEXT DEFAULT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    )
  `);
}
