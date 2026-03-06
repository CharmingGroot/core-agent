/** PostgresGovernanceStore - PostgreSQL IGovernanceStore. Parameterized queries only. */
import type {
  IGovernanceStore, UserIdentity, RoleName, RoleDefinition, GovernancePolicy,
  AuditEntry, AuditLogFilter, ApprovalRequest, ApprovalStatus, PendingApproval,
} from '@core/types';
import { type PgPool, loadPg, createPostgresTables } from './postgres-schema.js';

export interface PostgresConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string;
  readonly ssl?: boolean;
}

export class PostgresGovernanceStore implements IGovernanceStore {
  private readonly config: PostgresConfig;
  private pool: PgPool | null = null;

  constructor(config: PostgresConfig) { this.config = config; }

  async connect(): Promise<void> {
    const pg = await loadPg();
    this.pool = new pg.default.Pool({
      host: this.config.host, port: this.config.port,
      database: this.config.database, user: this.config.user,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
    });
  }

  async disconnect(): Promise<void> {
    if (this.pool) { await this.pool.end(); this.pool = null; }
  }

  isConnected(): boolean { return this.pool !== null; }

  private getPool(): PgPool {
    if (!this.pool) throw new Error('Not connected. Call connect() first.');
    return this.pool;
  }

  async createTables(): Promise<void> { await createPostgresTables(this.getPool()); }

  // --- 사용자 CRUD ---

  async createUser(user: UserIdentity): Promise<void> {
    const pool = this.getPool();
    await pool.query(
      `INSERT INTO governance_users (user_id, username, metadata)
       VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING`,
      [user.userId, user.username, JSON.stringify(user.metadata ?? {})],
    );
    for (const role of user.roles) {
      await pool.query(
        `INSERT INTO governance_user_roles (user_id, role_name)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [user.userId, role],
      );
    }
    for (const domain of user.domainIds) {
      await pool.query(
        `INSERT INTO governance_user_domains (user_id, domain_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [user.userId, domain],
      );
    }
  }

  async getUser(userId: string): Promise<UserIdentity | undefined> {
    const pool = this.getPool();
    const userResult = await pool.query(
      `SELECT user_id, username, metadata FROM governance_users WHERE user_id = $1`,
      [userId],
    );
    if (userResult.rows.length === 0) return undefined;
    const row = userResult.rows[0];
    const rolesResult = await pool.query(
      `SELECT role_name FROM governance_user_roles WHERE user_id = $1`, [userId],
    );
    const domainsResult = await pool.query(
      `SELECT domain_id FROM governance_user_domains WHERE user_id = $1`, [userId],
    );
    return {
      userId: row['user_id'] as string,
      username: row['username'] as string,
      roles: rolesResult.rows.map((r) => r['role_name'] as string),
      domainIds: domainsResult.rows.map((r) => r['domain_id'] as string),
      metadata: row['metadata'] as Record<string, unknown>,
    };
  }

  async updateUser(userId: string, updates: Partial<UserIdentity>): Promise<void> {
    const pool = this.getPool();
    if (updates.username) {
      await pool.query(`UPDATE governance_users SET username = $1 WHERE user_id = $2`,
        [updates.username, userId]);
    }
    if (updates.metadata) {
      await pool.query(`UPDATE governance_users SET metadata = $1 WHERE user_id = $2`,
        [JSON.stringify(updates.metadata), userId]);
    }
  }

  async deleteUser(userId: string): Promise<void> {
    await this.getPool().query(`DELETE FROM governance_users WHERE user_id = $1`, [userId]);
  }

  async listUsers(): Promise<readonly UserIdentity[]> {
    const result = await this.getPool().query(`SELECT user_id FROM governance_users`);
    const users: UserIdentity[] = [];
    for (const row of result.rows) {
      const user = await this.getUser(row['user_id'] as string);
      if (user) users.push(user);
    }
    return users;
  }

  // --- 역할 CRUD ---

  async createRole(role: RoleDefinition): Promise<void> {
    await this.getPool().query(
      `INSERT INTO governance_roles (name, description, allowed_skills, allowed_tools, policy)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO NOTHING`,
      [role.name, role.description, JSON.stringify(role.allowedSkills),
       JSON.stringify(role.allowedTools), JSON.stringify(role.policy)],
    );
  }

  async getRole(name: RoleName): Promise<RoleDefinition | undefined> {
    const result = await this.getPool().query(
      `SELECT name, description, allowed_skills, allowed_tools, policy
       FROM governance_roles WHERE name = $1`, [name],
    );
    if (result.rows.length === 0) return undefined;
    const row = result.rows[0];
    return {
      name: row['name'] as string,
      description: row['description'] as string,
      allowedSkills: row['allowed_skills'] as readonly string[],
      allowedTools: row['allowed_tools'] as readonly string[],
      policy: row['policy'] as GovernancePolicy,
    };
  }

  async updateRole(name: RoleName, updates: Partial<RoleDefinition>): Promise<void> {
    const pool = this.getPool();
    if (updates.description !== undefined)
      await pool.query(`UPDATE governance_roles SET description = $1 WHERE name = $2`,
        [updates.description, name]);
    if (updates.allowedSkills !== undefined)
      await pool.query(`UPDATE governance_roles SET allowed_skills = $1 WHERE name = $2`,
        [JSON.stringify(updates.allowedSkills), name]);
    if (updates.allowedTools !== undefined)
      await pool.query(`UPDATE governance_roles SET allowed_tools = $1 WHERE name = $2`,
        [JSON.stringify(updates.allowedTools), name]);
    if (updates.policy !== undefined)
      await pool.query(`UPDATE governance_roles SET policy = $1 WHERE name = $2`,
        [JSON.stringify(updates.policy), name]);
  }

  async deleteRole(name: RoleName): Promise<void> {
    await this.getPool().query(`DELETE FROM governance_roles WHERE name = $1`, [name]);
  }

  async listRoles(): Promise<readonly RoleDefinition[]> {
    const result = await this.getPool().query(`SELECT name FROM governance_roles`);
    const roles: RoleDefinition[] = [];
    for (const row of result.rows) {
      const role = await this.getRole(row['name'] as string);
      if (role) roles.push(role);
    }
    return roles;
  }

  // --- 할당 ---

  async assignRole(userId: string, roleName: RoleName): Promise<void> {
    await this.getPool().query(
      `INSERT INTO governance_user_roles (user_id, role_name)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, roleName]);
  }

  async revokeRole(userId: string, roleName: RoleName): Promise<void> {
    await this.getPool().query(
      `DELETE FROM governance_user_roles WHERE user_id = $1 AND role_name = $2`,
      [userId, roleName]);
  }

  async assignDomain(userId: string, domainId: string): Promise<void> {
    await this.getPool().query(
      `INSERT INTO governance_user_domains (user_id, domain_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, domainId]);
  }

  async revokeDomain(userId: string, domainId: string): Promise<void> {
    await this.getPool().query(
      `DELETE FROM governance_user_domains WHERE user_id = $1 AND domain_id = $2`,
      [userId, domainId]);
  }

  // --- 감사 로그 ---

  async insertAuditLog(entry: AuditEntry): Promise<void> {
    await this.getPool().query(
      `INSERT INTO governance_audit_logs
       (timestamp,run_id,agent_id,domain_id,user_id,action,
        tool_name,skill_name,input,output,decision,reason,
        data_classification,duration_ms,token_usage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [entry.timestamp, entry.runId, entry.agentId, entry.domainId ?? null,
       entry.userId, entry.action, entry.toolName ?? null, entry.skillName ?? null,
       entry.input ? JSON.stringify(entry.input) : null,
       entry.output ? JSON.stringify(entry.output) : null,
       entry.decision, entry.reason ?? null, entry.dataClassification ?? null,
       entry.durationMs ?? null, entry.tokenUsage ? JSON.stringify(entry.tokenUsage) : null],
    );
  }

  async queryAuditLogs(filter: AuditLogFilter): Promise<readonly AuditEntry[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (filter.userId) { conditions.push(`user_id = $${idx++}`); values.push(filter.userId); }
    if (filter.domainId) { conditions.push(`domain_id = $${idx++}`); values.push(filter.domainId); }
    if (filter.action) { conditions.push(`action = $${idx++}`); values.push(filter.action); }
    if (filter.from) { conditions.push(`timestamp >= $${idx++}`); values.push(filter.from); }
    if (filter.to) { conditions.push(`timestamp <= $${idx++}`); values.push(filter.to); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitC = filter.limit ? `LIMIT $${idx++}` : '';
    if (filter.limit) values.push(filter.limit);
    const offsetC = filter.offset ? `OFFSET $${idx++}` : '';
    if (filter.offset) values.push(filter.offset);
    const result = await this.getPool().query(
      `SELECT * FROM governance_audit_logs ${where}
       ORDER BY timestamp DESC ${limitC} ${offsetC}`, values);
    return result.rows.map((row) => ({
      timestamp: new Date(row['timestamp'] as string),
      runId: row['run_id'] as string, agentId: row['agent_id'] as string,
      domainId: row['domain_id'] as string | undefined,
      userId: row['user_id'] as string,
      action: row['action'] as AuditEntry['action'],
      toolName: row['tool_name'] as string | undefined,
      skillName: row['skill_name'] as string | undefined,
      input: row['input'] as Record<string, unknown> | undefined,
      output: row['output'] as Record<string, unknown> | undefined,
      decision: row['decision'] as AuditEntry['decision'],
      reason: row['reason'] as string | undefined,
      dataClassification: row['data_classification'] as AuditEntry['dataClassification'],
      durationMs: row['duration_ms'] as number | undefined,
      tokenUsage: row['token_usage'] as { input: number; output: number } | undefined,
    }));
  }

  // --- 승인 ---

  async createApprovalRequest(request: ApprovalRequest & { id: string }): Promise<void> {
    await this.getPool().query(
      `INSERT INTO governance_approvals (id, user_id, tool_name, action, params, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [request.id, request.userId, request.toolName, request.action,
       JSON.stringify(request.params), request.reason ?? null]);
  }

  async updateApprovalStatus(
    id: string, status: ApprovalStatus, approvedBy?: string, reason?: string,
  ): Promise<void> {
    await this.getPool().query(
      `UPDATE governance_approvals SET status = $1, approved_by = $2, status_reason = $3
       WHERE id = $4`, [status, approvedBy ?? null, reason ?? null, id]);
  }

  async getPendingApprovals(_approverId?: string): Promise<readonly PendingApproval[]> {
    const result = await this.getPool().query(
      `SELECT id, user_id, tool_name, action, params, reason, created_at
       FROM governance_approvals WHERE status = $1`, ['pending']);
    return result.rows.map((row) => ({
      id: row['id'] as string, userId: row['user_id'] as string,
      toolName: row['tool_name'] as string, action: row['action'] as string,
      params: row['params'] as Record<string, unknown>,
      reason: row['reason'] as string | undefined,
      createdAt: new Date(row['created_at'] as string),
    }));
  }
}
