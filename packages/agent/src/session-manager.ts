import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { AgentLogger } from '@cli-agent/core';
import { createChildLogger } from '@cli-agent/core';
import { MessageManager } from './message-manager.js';

/** Metadata stored alongside the conversation messages */
export interface SessionMeta {
  readonly sessionId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** On-disk JSON shape */
interface SessionFile {
  meta: SessionMeta;
  messages: string; // MessageManager.serialize() output
}

/**
 * Persists and restores agent conversations to/from disk.
 *
 * Usage:
 *   const sm = new SessionManager('/path/to/sessions');
 *   await sm.save(sessionId, messageManager);
 *   await sm.load(sessionId, messageManager);
 */
export class SessionManager {
  private readonly sessionsDir: string;
  private readonly logger: AgentLogger;

  constructor(sessionsDir: string) {
    this.sessionsDir = sessionsDir;
    this.logger = createChildLogger('session-manager');
  }

  /** Save the current conversation to disk. */
  async save(sessionId: string, manager: MessageManager): Promise<void> {
    const filePath = this.sessionPath(sessionId);
    await mkdir(dirname(filePath), { recursive: true });

    let meta: SessionMeta;
    try {
      const existing = await this.readSessionFile(filePath);
      meta = {
        sessionId,
        createdAt: existing.meta.createdAt,
        updatedAt: new Date().toISOString(),
      };
    } catch {
      meta = {
        sessionId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const data: SessionFile = {
      meta,
      messages: manager.serialize(),
    };

    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    this.logger.info({ sessionId, messages: manager.messageCount }, 'Session saved');
  }

  /** Restore a conversation from disk into the given MessageManager. */
  async load(sessionId: string, manager: MessageManager): Promise<SessionMeta> {
    const filePath = this.sessionPath(sessionId);
    const data = await this.readSessionFile(filePath);
    manager.restore(data.messages);
    this.logger.info({ sessionId, messages: manager.messageCount }, 'Session loaded');
    return data.meta;
  }

  /** Check if a session file exists. */
  async exists(sessionId: string): Promise<boolean> {
    try {
      await this.readSessionFile(this.sessionPath(sessionId));
      return true;
    } catch {
      return false;
    }
  }

  /** List all session IDs in the sessions directory. */
  async list(): Promise<SessionMeta[]> {
    const { readdir } = await import('node:fs/promises');
    try {
      const entries = await readdir(this.sessionsDir);
      const metas: SessionMeta[] = [];
      for (const entry of entries) {
        if (!entry.endsWith('.session.json')) continue;
        try {
          const data = await this.readSessionFile(join(this.sessionsDir, entry));
          metas.push(data.meta);
        } catch {
          // skip corrupt files
        }
      }
      return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
      return [];
    }
  }

  private sessionPath(sessionId: string): string {
    // Sanitize sessionId to prevent path traversal
    const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.sessionsDir, `${safe}.session.json`);
  }

  private async readSessionFile(filePath: string): Promise<SessionFile> {
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as SessionFile;
    if (!parsed.meta || !parsed.messages) {
      throw new Error('Invalid session file format');
    }
    return parsed;
  }
}
