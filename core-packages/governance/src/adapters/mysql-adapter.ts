/**
 * MysqlGovernanceStore - MySQL/MariaDB 기반 IGovernanceStore 구현체.
 *
 * mysql2/promise 패키지를 동적 import하며, 미설치 시 명확한 에러를 던진다.
 * MariaDB는 mysql2 드라이버와 자동 호환된다.
 * 모든 쿼리는 parameterized (?) 방식으로 SQL injection을 방지한다.
 */
import type {
  IGovernanceStore,
  UserIdentity,
  RoleName,
  RoleDefinition,
  GovernancePolicy,
  AuditEntry,
  AuditLogFilter,
  ApprovalRequest,
  ApprovalStatus,
  PendingApproval,
} from '@core/types';
import { type MysqlPool, loadMysql, createMysqlTables } from './mysql-schema.js';

/** MySQL 연결 설정 */
export interface MysqlConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string;
}

function parseJson(val: unknown): unknown {
  return typeof val === 'string' ? JSON.parse(val) : val;
}

export class MysqlGovernanceStore implements IGovernanceStore {
  private readonly config: MysqlConfig;
  private pool: MysqlPool | null = null;

  constructor(config: MysqlConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const mysql = await loadMysql();
    this.pool = mysql.createPool({
      host: this.config.host, port: this.config.port,
      database: this.config.database, user: this.config.user,
      password: this.config.password,
    });
  }

  async disconnect(): Promise<void> {
    if (this.pool) { await this.pool.end(); this.pool = null; }
  }

  isConnected(): boolean { return this.pool !== null; }

  private getPool(): MysqlPool {
    if (!this.pool) throw new Error('Not connected. Call connect() first.');
    return this.pool;
  }

  async createTables(): Promise<void> {
    await createMysqlTables(this.getPool());
  }

  // --- 사용자 CRUD ---

  async createUser(user: UserIdentity): Promise<void> {
    const pool = this.getPool();
    await pool.execute(
      `INSERT IGNORE INTO governance_users (user_id, username, metadata) VALUES (?, ?, ?)`,
      [user.userId, user.username, JSON.stringify(user.metadata ?? {})]);
    for (const role of user.roles) {
      await pool.execute(
        `INSERT IGNORE INTO governance_user_roles (user_id, role_name) VALUES (?, ?)`,
        [user.userId, role]);
    }
    for (const domain of user.domainIds) {
      await pool.execute(
        `INSERT IGNORE INTO governance_user_domains (user_id, domain_id) VALUES (?, ?)`,
        [user.userId, domain]);
    }
  }

  async getUser(userId: string): Promise<UserIdentity | undefined> {
    const pool = this.getPool();
    const [userRows] = await pool.execute(
      `SELECT user_id, username, metadata FROM governance_users WHERE user_id = ?`, [userId]);
    if (userRows.length === 0) return undefined;
    const row = userRows[0];
    const [roleRows] = await pool.execute(
      `SELECT role_name FROM governance_user_roles WHERE user_id = ?`, [userId]);
    const [domainRows] = await pool.execute(
      `SELECT domain_id FROM governance_user_domains WHERE user_id = ?`, [userId]);
    return {
      userId: row['user_id'] as string, username: row['username'] as string,
      roles: roleRows.map((r) => r['role_name'] as string),
      domainIds: domainRows.map((r) => r['domain_id'] as string),
      metadata: parseJson(row['metadata']) as Record<string, unknown>,
    };
  }

  async updateUser(userId: string, updates: Partial<UserIdentity>): Promise<void> {
    const pool = this.getPool();
    if (updates.username)
      await pool.execute(`UPDATE governance_users SET username = ? WHERE user_id = ?`,
        [updates.username, userId]);
    if (updates.metadata)
      await pool.execute(`UPDATE governance_users SET metadata = ? WHERE user_id = ?`,
        [JSON.stringify(updates.metadata), userId]);
  }

  async deleteUser(userId: string): Promise<void> {
    await this.getPool().execute(`DELETE FROM governance_users WHERE user_id = ?`, [userId]);
  }

  async listUsers(): Promise<readonly UserIdentity[]> {
    const [rows] = await this.getPool().execute(`SELECT user_id FROM governance_users`);
    const users: UserIdentity[] = [];
    for (const row of rows) {
      const user = await this.getUser(row['user_id'] as string);
      if (user) users.push(user);
    }
    return users;
  }

  // --- 역할 CRUD ---

  async createRole(role: RoleDefinition): Promise<void> {
    await this.getPool().execute(
      `INSERT IGNORE INTO governance_roles (name, description, allowed_skills, allowed_tools, policy)
       VALUES (?, ?, ?, ?, ?)`,
      [role.name, role.description, JSON.stringify(role.allowedSkills),
       JSON.stringify(role.allowedTools), JSON.stringify(role.policy)]);
  }

  async getRole(name: RoleName): Promise<RoleDefinition | undefined> {
    const [rows] = await this.getPool().execute(
      `SELECT name, description, allowed_skills, allowed_tools, policy
       FROM governance_roles WHERE name = ?`, [name]);
    if (rows.length === 0) return undefined;
    const row = rows[0];
    return {
      name: row['name'] as string, description: row['description'] as string,
      allowedSkills: parseJson(row['allowed_skills']) as readonly string[],
      allowedTools: parseJson(row['allowed_tools']) as readonly string[],
      policy: parseJson(row['policy']) as GovernancePolicy,
    };
  }

  async updateRole(name: RoleName, updates: Partial<RoleDefinition>): Promise<void> {
    const pool = this.getPool();
    if (updates.description !== undefined)
      await pool.execute(`UPDATE governance_roles SET description = ? WHERE name = ?`,
        [updates.description, name]);
    if (updates.allowedSkills !== undefined)
      await pool.execute(`UPDATE governance_roles SET allowed_skills = ? WHERE name = ?`,
        [JSON.stringify(updates.allowedSkills), name]);
    if (updates.allowedTools !== undefined)
      await pool.execute(`UPDATE governance_roles SET allowed_tools = ? WHERE name = ?`,
        [JSON.stringify(updates.allowedTools), name]);
    if (updates.policy !== undefined)
      await pool.execute(`UPDATE governance_roles SET policy = ? WHERE name = ?`,
        [JSON.stringify(updates.policy), name]);
  }

  async deleteRole(name: RoleName): Promise<void> {
    await this.getPool().execute(`DELETE FROM governance_roles WHERE name = ?`, [name]);
  }

  async listRoles(): Promise<readonly RoleDefinition[]> {
    const [rows] = await this.getPool().execute(`SELECT name FROM governance_roles`);
    const roles: RoleDefinition[] = [];
    for (const row of rows) {
      const role = await this.getRole(row['name'] as string);
      if (role) roles.push(role);
    }
    return roles;
  }

  // --- 할당 ---

  async assignRole(userId: string, roleName: RoleName): Promise<void> {
    await this.getPool().execute(
      `INSERT IGNORE INTO governance_user_roles (user_id, role_name) VALUES (?, ?)`,
      [userId, roleName]);
  }

  async revokeRole(userId: string, roleName: RoleName): Promise<void> {
    await this.getPool().execute(
      `DELETE FROM governance_user_roles WHERE user_id = ? AND role_name = ?`,
      [userId, roleName]);
  }

  async assignDomain(userId: string, domainId: string): Promise<void> {
    await this.getPool().execute(
      `INSERT IGNORE INTO governance_user_domains (user_id, domain_id) VALUES (?, ?)`,
      [userId, domainId]);
  }

  async revokeDomain(userId: string, domainId: string): Promise<void> {
    await this.getPool().execute(
      `DELETE FROM governance_user_domains WHERE user_id = ? AND domain_id = ?`,
      [userId, domainId]);
  }

  // --- 감사 로그 ---

  async insertAuditLog(entry: AuditEntry): Promise<void> {
    await this.getPool().execute(
      `INSERT INTO governance_audit_logs
       (timestamp,run_id,agent_id,domain_id,user_id,action,
        tool_name,skill_name,input,output_data,decision,reason,
        data_classification,duration_ms,token_usage)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [entry.timestamp, entry.runId, entry.agentId, entry.domainId ?? null,
       entry.userId, entry.action, entry.toolName ?? null, entry.skillName ?? null,
       entry.input ? JSON.stringify(entry.input) : null,
       entry.output ? JSON.stringify(entry.output) : null,
       entry.decision, entry.reason ?? null, entry.dataClassification ?? null,
       entry.durationMs ?? null, entry.tokenUsage ? JSON.stringify(entry.tokenUsage) : null]);
  }

  async queryAuditLogs(filter: AuditLogFilter): Promise<readonly AuditEntry[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (filter.userId) { conditions.push(`user_id = ?`); values.push(filter.userId); }
    if (filter.domainId) { conditions.push(`domain_id = ?`); values.push(filter.domainId); }
    if (filter.action) { conditions.push(`action = ?`); values.push(filter.action); }
    if (filter.from) { conditions.push(`timestamp >= ?`); values.push(filter.from); }
    if (filter.to) { conditions.push(`timestamp <= ?`); values.push(filter.to); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    if (filter.limit) values.push(filter.limit);
    if (filter.offset) values.push(filter.offset);
    const limitC = filter.limit ? `LIMIT ?` : '';
    const offsetC = filter.offset ? `OFFSET ?` : '';
    const [rows] = await this.getPool().execute(
      `SELECT * FROM governance_audit_logs ${where}
       ORDER BY timestamp DESC ${limitC} ${offsetC}`, values);
    return rows.map((row) => ({
      timestamp: new Date(row['timestamp'] as string),
      runId: row['run_id'] as string, agentId: row['agent_id'] as string,
      domainId: row['domain_id'] as string | undefined,
      userId: row['user_id'] as string,
      action: row['action'] as AuditEntry['action'],
      toolName: row['tool_name'] as string | undefined,
      skillName: row['skill_name'] as string | undefined,
      input: row['input'] as Record<string, unknown> | undefined,
      output: row['output_data'] as Record<string, unknown> | undefined,
      decision: row['decision'] as AuditEntry['decision'],
      reason: row['reason'] as string | undefined,
      dataClassification: row['data_classification'] as AuditEntry['dataClassification'],
      durationMs: row['duration_ms'] as number | undefined,
      tokenUsage: row['token_usage'] as { input: number; output: number } | undefined,
    }));
  }

  // --- 승인 ---

  async createApprovalRequest(request: ApprovalRequest & { id: string }): Promise<void> {
    await this.getPool().execute(
      `INSERT INTO governance_approvals (id, user_id, tool_name, action, params, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [request.id, request.userId, request.toolName, request.action,
       JSON.stringify(request.params), request.reason ?? null]);
  }

  async updateApprovalStatus(
    id: string, status: ApprovalStatus, approvedBy?: string, reason?: string,
  ): Promise<void> {
    await this.getPool().execute(
      `UPDATE governance_approvals SET status = ?, approved_by = ?, status_reason = ?
       WHERE id = ?`, [status, approvedBy ?? null, reason ?? null, id]);
  }

  async getPendingApprovals(_approverId?: string): Promise<readonly PendingApproval[]> {
    const [rows] = await this.getPool().execute(
      `SELECT id, user_id, tool_name, action, params, reason, created_at
       FROM governance_approvals WHERE status = ?`, ['pending']);
    return rows.map((row) => ({
      id: row['id'] as string, userId: row['user_id'] as string,
      toolName: row['tool_name'] as string, action: row['action'] as string,
      params: parseJson(row['params']) as Record<string, unknown>,
      reason: row['reason'] as string | undefined,
      createdAt: new Date(row['created_at'] as string),
    }));
  }
}
