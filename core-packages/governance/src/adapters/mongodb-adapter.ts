/** MongoGovernanceStore - MongoDB IGovernanceStore. Collections: users, roles, audit_logs, approvals */
import type {
  IGovernanceStore, UserIdentity, RoleName, RoleDefinition, GovernancePolicy,
  AuditEntry, AuditLogFilter, ApprovalRequest, ApprovalStatus, PendingApproval,
} from '@core/types';

export interface MongoConfig { readonly uri: string; readonly database: string; }

interface MongoCollection {
  insertOne(doc: Record<string, unknown>): Promise<{ insertedId: unknown }>;
  findOne(filter: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  find(filter: Record<string, unknown>): MongoCursor;
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ modifiedCount: number }>;
  deleteOne(filter: Record<string, unknown>): Promise<{ deletedCount: number }>;
}

interface MongoCursor {
  sort(sort: Record<string, number>): MongoCursor;
  skip(n: number): MongoCursor;
  limit(n: number): MongoCursor;
  toArray(): Promise<Record<string, unknown>[]>;
}

interface MongoDb { collection(name: string): MongoCollection; }
interface MongoClient { connect(): Promise<void>; close(): Promise<void>; db(name: string): MongoDb; }
interface MongoModule { MongoClient: new (uri: string) => MongoClient; }

async function loadMongodb(): Promise<MongoModule> {
  try { return await import('mongodb') as unknown as MongoModule; }
  catch { throw new Error('mongodb package is required. Install with: npm install mongodb'); }
}

export class MongoGovernanceStore implements IGovernanceStore {
  private readonly mongoConfig: MongoConfig;
  private client: MongoClient | null = null;
  private db: MongoDb | null = null;

  constructor(config: MongoConfig) { this.mongoConfig = config; }

  async connect(): Promise<void> {
    const mongo = await loadMongodb();
    this.client = new mongo.MongoClient(this.mongoConfig.uri);
    await this.client.connect();
    this.db = this.client.db(this.mongoConfig.database);
  }

  async disconnect(): Promise<void> {
    if (this.client) { await this.client.close(); this.client = null; this.db = null; }
  }

  isConnected(): boolean { return this.client !== null && this.db !== null; }

  private getDb(): MongoDb {
    if (!this.db) throw new Error('Not connected. Call connect() first.');
    return this.db;
  }

  // --- 사용자 CRUD ---

  async createUser(user: UserIdentity): Promise<void> {
    const db = this.getDb();
    const existing = await db.collection('users').findOne({ userId: user.userId });
    if (existing) return;
    await db.collection('users').insertOne({
      userId: user.userId, username: user.username,
      roles: [...user.roles], domainIds: [...user.domainIds],
      metadata: user.metadata ?? {},
    });
  }

  async getUser(userId: string): Promise<UserIdentity | undefined> {
    const doc = await this.getDb().collection('users').findOne({ userId });
    if (!doc) return undefined;
    return {
      userId: doc['userId'] as string, username: doc['username'] as string,
      roles: doc['roles'] as readonly string[],
      domainIds: doc['domainIds'] as readonly string[],
      metadata: doc['metadata'] as Record<string, unknown> | undefined,
    };
  }

  async updateUser(userId: string, updates: Partial<UserIdentity>): Promise<void> {
    const setFields: Record<string, unknown> = {};
    if (updates.username !== undefined) setFields['username'] = updates.username;
    if (updates.roles !== undefined) setFields['roles'] = [...updates.roles];
    if (updates.domainIds !== undefined) setFields['domainIds'] = [...updates.domainIds];
    if (updates.metadata !== undefined) setFields['metadata'] = updates.metadata;
    if (Object.keys(setFields).length > 0) {
      await this.getDb().collection('users').updateOne({ userId }, { $set: setFields });
    }
  }

  async deleteUser(userId: string): Promise<void> {
    await this.getDb().collection('users').deleteOne({ userId });
  }

  async listUsers(): Promise<readonly UserIdentity[]> {
    const docs = await this.getDb().collection('users').find({}).toArray();
    return docs.map((doc) => ({
      userId: doc['userId'] as string, username: doc['username'] as string,
      roles: doc['roles'] as readonly string[],
      domainIds: doc['domainIds'] as readonly string[],
      metadata: doc['metadata'] as Record<string, unknown> | undefined,
    }));
  }

  // --- 역할 CRUD ---

  async createRole(role: RoleDefinition): Promise<void> {
    const db = this.getDb();
    const existing = await db.collection('roles').findOne({ name: role.name });
    if (existing) return;
    await db.collection('roles').insertOne({
      name: role.name, description: role.description,
      allowedSkills: [...role.allowedSkills], allowedTools: [...role.allowedTools],
      policy: { ...role.policy },
    });
  }

  async getRole(name: RoleName): Promise<RoleDefinition | undefined> {
    const doc = await this.getDb().collection('roles').findOne({ name });
    if (!doc) return undefined;
    return {
      name: doc['name'] as string, description: doc['description'] as string,
      allowedSkills: doc['allowedSkills'] as readonly string[],
      allowedTools: doc['allowedTools'] as readonly string[],
      policy: doc['policy'] as GovernancePolicy,
    };
  }

  async updateRole(name: RoleName, updates: Partial<RoleDefinition>): Promise<void> {
    const setFields: Record<string, unknown> = {};
    if (updates.description !== undefined) setFields['description'] = updates.description;
    if (updates.allowedSkills !== undefined) setFields['allowedSkills'] = [...updates.allowedSkills];
    if (updates.allowedTools !== undefined) setFields['allowedTools'] = [...updates.allowedTools];
    if (updates.policy !== undefined) setFields['policy'] = { ...updates.policy };
    if (Object.keys(setFields).length > 0) {
      await this.getDb().collection('roles').updateOne({ name }, { $set: setFields });
    }
  }

  async deleteRole(name: RoleName): Promise<void> {
    await this.getDb().collection('roles').deleteOne({ name });
  }

  async listRoles(): Promise<readonly RoleDefinition[]> {
    const docs = await this.getDb().collection('roles').find({}).toArray();
    return docs.map((doc) => ({
      name: doc['name'] as string, description: doc['description'] as string,
      allowedSkills: doc['allowedSkills'] as readonly string[],
      allowedTools: doc['allowedTools'] as readonly string[],
      policy: doc['policy'] as GovernancePolicy,
    }));
  }

  // --- 할당 ---

  async assignRole(userId: string, roleName: RoleName): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) throw new Error(`User not found: ${userId}`);
    if (user.roles.includes(roleName)) return;
    await this.updateUser(userId, { roles: [...user.roles, roleName] });
  }

  async revokeRole(userId: string, roleName: RoleName): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) throw new Error(`User not found: ${userId}`);
    await this.updateUser(userId, { roles: user.roles.filter((r) => r !== roleName) });
  }

  async assignDomain(userId: string, domainId: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) throw new Error(`User not found: ${userId}`);
    if (user.domainIds.includes(domainId)) return;
    await this.updateUser(userId, { domainIds: [...user.domainIds, domainId] });
  }

  async revokeDomain(userId: string, domainId: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) throw new Error(`User not found: ${userId}`);
    await this.updateUser(userId, { domainIds: user.domainIds.filter((d) => d !== domainId) });
  }

  // --- 감사 로그 ---

  async insertAuditLog(entry: AuditEntry): Promise<void> {
    await this.getDb().collection('audit_logs').insertOne({ ...entry });
  }

  async queryAuditLogs(filter: AuditLogFilter): Promise<readonly AuditEntry[]> {
    const query: Record<string, unknown> = {};
    if (filter.userId) query['userId'] = filter.userId;
    if (filter.domainId) query['domainId'] = filter.domainId;
    if (filter.action) query['action'] = filter.action;
    if (filter.from || filter.to) {
      const tf: Record<string, unknown> = {};
      if (filter.from) tf['$gte'] = filter.from;
      if (filter.to) tf['$lte'] = filter.to;
      query['timestamp'] = tf;
    }
    let cursor = this.getDb().collection('audit_logs').find(query).sort({ timestamp: -1 });
    if (filter.offset) cursor = cursor.skip(filter.offset);
    if (filter.limit) cursor = cursor.limit(filter.limit);
    const docs = await cursor.toArray();
    return docs.map((doc) => ({
      timestamp: doc['timestamp'] as Date, runId: doc['runId'] as string,
      agentId: doc['agentId'] as string, domainId: doc['domainId'] as string | undefined,
      userId: doc['userId'] as string, action: doc['action'] as AuditEntry['action'],
      toolName: doc['toolName'] as string | undefined,
      skillName: doc['skillName'] as string | undefined,
      input: doc['input'] as Record<string, unknown> | undefined,
      output: doc['output'] as Record<string, unknown> | undefined,
      decision: doc['decision'] as AuditEntry['decision'],
      reason: doc['reason'] as string | undefined,
      dataClassification: doc['dataClassification'] as AuditEntry['dataClassification'],
      durationMs: doc['durationMs'] as number | undefined,
      tokenUsage: doc['tokenUsage'] as { input: number; output: number } | undefined,
    }));
  }

  // --- 승인 ---

  async createApprovalRequest(request: ApprovalRequest & { id: string }): Promise<void> {
    await this.getDb().collection('approvals').insertOne({
      id: request.id, userId: request.userId, toolName: request.toolName,
      action: request.action, params: request.params, reason: request.reason,
      status: 'pending', createdAt: new Date(),
    });
  }

  async updateApprovalStatus(
    id: string, status: ApprovalStatus, approvedBy?: string, reason?: string,
  ): Promise<void> {
    await this.getDb().collection('approvals').updateOne(
      { id }, { $set: { status, approvedBy, statusReason: reason } });
  }

  async getPendingApprovals(_approverId?: string): Promise<readonly PendingApproval[]> {
    const docs = await this.getDb().collection('approvals')
      .find({ status: 'pending' }).toArray();
    return docs.map((doc) => ({
      id: doc['id'] as string, userId: doc['userId'] as string,
      toolName: doc['toolName'] as string, action: doc['action'] as string,
      params: doc['params'] as Record<string, unknown>,
      reason: doc['reason'] as string | undefined,
      createdAt: doc['createdAt'] as Date,
    }));
  }
}
