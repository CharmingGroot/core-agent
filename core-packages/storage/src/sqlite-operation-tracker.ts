/**
 * SQLiteOperationTracker — SQLite-backed IOperationTracker implementation.
 *
 * Persists operation state to a SQLite database via sql.js (pure JS, no native deps).
 * Drop-in replacement for InMemoryOperationTracker.
 *
 * Usage:
 *   const tracker = await SQLiteOperationTracker.create('/path/to/ops.db');
 *   const id = tracker.create({ requestId: '...', userId: '...', domainId: '...', goal: '...' });
 */

import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabase } from 'sql.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  IOperationTracker,
  OperationState,
  OperationProgress,
  OperationTaskResult,
  OperationFilter,
  OperationStatus,
} from '@core/types';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS operations (
    operation_id TEXT PRIMARY KEY,
    request_id   TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    domain_id    TEXT NOT NULL,
    goal         TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    progress     TEXT,
    started_at   TEXT NOT NULL,
    completed_at TEXT,
    error        TEXT,
    token_input  INTEGER NOT NULL DEFAULT 0,
    token_output INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS operation_tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id  TEXT NOT NULL,
    task_id       TEXT NOT NULL,
    skill_name    TEXT NOT NULL,
    status        TEXT NOT NULL,
    summary       TEXT NOT NULL DEFAULT '',
    duration_ms   INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (operation_id) REFERENCES operations(operation_id)
  );

  CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);
  CREATE INDEX IF NOT EXISTS idx_operations_user   ON operations(user_id);
  CREATE INDEX IF NOT EXISTS idx_operations_domain ON operations(domain_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_operation    ON operation_tasks(operation_id);
`;

let counter = 0;

function generateOperationId(): string {
  counter += 1;
  const timestamp = Date.now().toString(36);
  const seq = counter.toString(36).padStart(4, '0');
  return `op-${timestamp}-${seq}`;
}

export interface SQLiteOperationTrackerEvents {
  onStatusChange?: (operationId: string, status: OperationStatus, state: OperationState) => void;
}

export class SQLiteOperationTracker implements IOperationTracker {
  private readonly db: SqlJsDatabase;
  private readonly dbPath: string | null;
  private readonly events: SQLiteOperationTrackerEvents;

  private constructor(
    db: SqlJsDatabase,
    dbPath: string | null,
    events: SQLiteOperationTrackerEvents,
  ) {
    this.db = db;
    this.dbPath = dbPath;
    this.events = events;
    this.db.run(CREATE_TABLE_SQL);
  }

  /**
   * Create a new SQLiteOperationTracker.
   * If dbPath is provided, loads existing data from file (creates if not exists).
   * If dbPath is null, creates an in-memory database.
   */
  static async create(
    dbPath?: string | null,
    events?: SQLiteOperationTrackerEvents,
  ): Promise<SQLiteOperationTracker> {
    const SQL = await initSqlJs();

    let db: SqlJsDatabase;
    if (dbPath) {
      try {
        const buffer = await readFile(dbPath);
        db = new SQL.Database(buffer);
      } catch {
        db = new SQL.Database();
      }
    } else {
      db = new SQL.Database();
    }

    return new SQLiteOperationTracker(db, dbPath ?? null, events ?? {});
  }

  create(params: {
    requestId: string;
    userId: string;
    domainId: string;
    goal: string;
  }): string {
    const operationId = generateOperationId();
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO operations (operation_id, request_id, user_id, domain_id, goal, status, started_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [operationId, params.requestId, params.userId, params.domainId, params.goal, now],
    );

    const state = this.mustGet(operationId);
    this.emitChange(operationId, 'pending', state);
    return operationId;
  }

  start(operationId: string): void {
    this.db.run(`UPDATE operations SET status = 'running' WHERE operation_id = ?`, [operationId]);
    const state = this.mustGet(operationId);
    this.emitChange(operationId, 'running', state);
  }

  updateProgress(operationId: string, progress: OperationProgress): void {
    this.db.run(
      `UPDATE operations SET progress = ? WHERE operation_id = ?`,
      [JSON.stringify(progress), operationId],
    );
  }

  addTaskResult(operationId: string, result: OperationTaskResult): void {
    this.db.run(
      `INSERT INTO operation_tasks (operation_id, task_id, skill_name, status, summary, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [operationId, result.taskId, result.skillName, result.status, result.summary, result.durationMs],
    );
  }

  complete(operationId: string, tokenUsage?: { input: number; output: number }): void {
    const now = new Date().toISOString();
    if (tokenUsage) {
      this.db.run(
        `UPDATE operations SET status = 'completed', completed_at = ?, token_input = ?, token_output = ? WHERE operation_id = ?`,
        [now, tokenUsage.input, tokenUsage.output, operationId],
      );
    } else {
      this.db.run(
        `UPDATE operations SET status = 'completed', completed_at = ? WHERE operation_id = ?`,
        [now, operationId],
      );
    }
    const state = this.mustGet(operationId);
    this.emitChange(operationId, 'completed', state);
  }

  fail(operationId: string, error: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE operations SET status = 'failed', completed_at = ?, error = ? WHERE operation_id = ?`,
      [now, error, operationId],
    );
    const state = this.mustGet(operationId);
    this.emitChange(operationId, 'failed', state);
  }

  cancel(operationId: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE operations SET status = 'cancelled', completed_at = ? WHERE operation_id = ?`,
      [now, operationId],
    );
    const state = this.mustGet(operationId);
    this.emitChange(operationId, 'cancelled', state);
  }

  get(operationId: string): OperationState | undefined {
    const results = this.db.exec(
      `SELECT * FROM operations WHERE operation_id = ?`,
      [operationId],
    );
    if (results.length === 0 || results[0].values.length === 0) return undefined;
    const row = this.resultToRow(results[0]);
    return this.rowToState(row);
  }

  list(filter?: OperationFilter): readonly OperationState[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.userId) {
      conditions.push('user_id = ?');
      params.push(filter.userId);
    }
    if (filter?.domainId) {
      conditions.push('domain_id = ?');
      params.push(filter.domainId);
    }
    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }

    let sql = 'SELECT * FROM operations';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY started_at DESC';
    if (filter?.limit) sql += ` LIMIT ${filter.limit}`;
    if (filter?.offset) sql += ` OFFSET ${filter.offset}`;

    const results = this.db.exec(sql, params as string[]);
    if (results.length === 0) return [];

    return this.resultToRows(results[0]).map((row) => this.rowToState(row));
  }

  listActive(): readonly OperationState[] {
    const results = this.db.exec(
      `SELECT * FROM operations WHERE status IN ('pending', 'running') ORDER BY started_at DESC`,
    );
    if (results.length === 0) return [];
    return this.resultToRows(results[0]).map((row) => this.rowToState(row));
  }

  /** Persist current state to the file system */
  async save(): Promise<void> {
    if (!this.dbPath) return;
    await mkdir(dirname(this.dbPath), { recursive: true });
    const data = this.db.export();
    await writeFile(this.dbPath, Buffer.from(data));
  }

  /** Close the database */
  close(): void {
    this.db.close();
  }

  private mustGet(operationId: string): OperationState {
    const state = this.get(operationId);
    if (!state) {
      throw new Error(`Operation not found: ${operationId}`);
    }
    return state;
  }

  private resultToRow(result: { columns: string[]; values: unknown[][] }): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    for (let i = 0; i < result.columns.length; i++) {
      row[result.columns[i]] = result.values[0][i];
    }
    return row;
  }

  private resultToRows(result: { columns: string[]; values: unknown[][] }): Record<string, unknown>[] {
    return result.values.map((values) => {
      const row: Record<string, unknown> = {};
      for (let i = 0; i < result.columns.length; i++) {
        row[result.columns[i]] = values[i];
      }
      return row;
    });
  }

  private rowToState(row: Record<string, unknown>): OperationState {
    const operationId = row['operation_id'] as string;

    const taskResults = this.db.exec(
      `SELECT * FROM operation_tasks WHERE operation_id = ? ORDER BY id`,
      [operationId],
    );

    const tasks: OperationTaskResult[] = taskResults.length > 0
      ? this.resultToRows(taskResults[0]).map((t) => ({
          taskId: t['task_id'] as string,
          skillName: t['skill_name'] as string,
          status: t['status'] as OperationStatus,
          summary: t['summary'] as string,
          durationMs: t['duration_ms'] as number,
        }))
      : [];

    const progressStr = row['progress'] as string | null;

    return {
      operationId,
      requestId: row['request_id'] as string,
      userId: row['user_id'] as string,
      domainId: row['domain_id'] as string,
      goal: row['goal'] as string,
      status: row['status'] as OperationStatus,
      progress: progressStr ? JSON.parse(progressStr) as OperationProgress : undefined,
      startedAt: new Date(row['started_at'] as string),
      completedAt: row['completed_at'] ? new Date(row['completed_at'] as string) : undefined,
      error: (row['error'] as string | null) ?? undefined,
      taskResults: tasks,
      tokenUsage: {
        input: row['token_input'] as number,
        output: row['token_output'] as number,
      },
    };
  }

  private emitChange(operationId: string, status: OperationStatus, state: OperationState): void {
    this.events.onStatusChange?.(operationId, status, state);
  }
}
