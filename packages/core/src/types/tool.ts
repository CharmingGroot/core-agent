import { z } from 'zod';
import type { JsonObject } from './common.js';
import type { RunContext } from '../run-context.js';

export interface ToolParameter {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly required: boolean;
}

export interface ToolDescription {
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly ToolParameter[];
}

export interface ToolResult {
  readonly success: boolean;
  readonly output: string;
  readonly error?: string;
  readonly metadata?: JsonObject;
}

export interface ITool {
  readonly name: string;
  readonly requiresPermission: boolean;
  describe(): ToolDescription;
  execute(params: JsonObject, context: RunContext): Promise<ToolResult>;
}

export const toolResultSchema = z.object({
  success: z.boolean(),
  output: z.string(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
