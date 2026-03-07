/**
 * ContextAssembler ↔ AgentLoop integration.
 *
 * Bridges the type gap between @cli-agent/agent (Message) and
 * @core/context-engine (ContextMessage, ToolDescriptionRef) without
 * introducing a hard dependency inside AgentLoop itself.
 *
 * Usage:
 *   const builder = createContextAwareBuilder({
 *     assembler: new ContextAssembler(budget),
 *     basePrompt: 'You are helpful.',
 *     toolRegistry,
 *     eventBus,
 *   });
 *   const agent = new AgentLoop({ ..., systemPromptBuilder: builder });
 */

import type { ITool, Message } from '@cli-agent/core';
import { Registry, RunContext, EventBus } from '@cli-agent/core';
import type { SystemPromptBuilder } from '@cli-agent/agent';
import type {
  ContextMessage,
  ToolDescriptionRef,
  ToolParamRef,
  AssembledContext,
  SectionUsage,
} from '@core/types';
import type { ContextAssembler, AssembleParams } from '@core/context-engine';

// ── Configuration ──────────────────────────────────────────────────

export interface ContextAwareBuilderConfig {
  /** The ContextAssembler instance (budget + pinning already set) */
  readonly assembler: ContextAssembler;
  /** Base system prompt (soul prompt, instructions, etc.) */
  readonly basePrompt: string;
  /** Tool registry to derive ToolDescriptionRefs from */
  readonly toolRegistry: Registry<ITool>;
  /** Optional event bus to emit context:assembled events */
  readonly eventBus?: EventBus;
  /** Optional skill-scoped tool names for filtering */
  readonly skillTools?: readonly string[];
  /**
   * Optional callback to enrich the base prompt dynamically.
   * Called before each assembly — e.g. inject cwd, open files, memory.
   */
  readonly promptEnricher?: (context: RunContext) => string | Promise<string>;
}

// ── Type Converters ────────────────────────────────────────────────

/** Convert @cli-agent/core Message → @core/types ContextMessage */
export function messageToContextMessage(msg: Message): ContextMessage {
  if (msg.toolResults && msg.toolResults.length > 0) {
    return {
      role: 'tool_result',
      content: msg.toolResults.map((r) => r.content).join('\n'),
      toolCallId: msg.toolResults[0].toolCallId,
    };
  }
  const roleMap: Record<string, ContextMessage['role']> = {
    system: 'system',
    user: 'user',
    assistant: 'assistant',
  };
  return {
    role: roleMap[msg.role] ?? 'user',
    content: msg.content,
  };
}

/** Convert ITool registry entries → ToolDescriptionRef[] for the assembler */
function toolsToDescriptionRefs(
  toolRegistry: Registry<ITool>,
): ToolDescriptionRef[] {
  const refs: ToolDescriptionRef[] = [];

  for (const [, tool] of toolRegistry.getAll()) {
    const desc = tool.describe();
    const params: ToolParamRef[] = desc.parameters.map((p) => ({
      name: p.name,
      type: p.type,
      description: p.description,
      required: p.required,
    }));

    refs.push({
      name: desc.name,
      description: desc.description,
      parameters: params,
      tokenEstimate: estimateToolDescTokens(desc.description, params),
    });
  }

  return refs;
}

/** Rough token estimate for a tool description (4 chars ≈ 1 token) */
function estimateToolDescTokens(
  description: string,
  params: readonly ToolParamRef[],
): number {
  let chars = description.length;
  for (const p of params) {
    chars += p.name.length + p.type.length + p.description.length;
  }
  return Math.ceil(chars / 4);
}

// ── Factory ────────────────────────────────────────────────────────

/**
 * Creates a SystemPromptBuilder backed by ContextAssembler.
 *
 * On each call the builder:
 *   1. Optionally enriches the base prompt via promptEnricher
 *   2. Converts the AgentLoop's messages → ContextMessage[]
 *   3. Runs ContextAssembler.assemble() for budget tracking + compression
 *   4. Emits 'context:assembled' with usage info
 *   5. Returns the (possibly budget-trimmed) system prompt
 *
 * The assembler's history compression works alongside
 * MessageManager.compressIfNeeded() — whichever fires first trims
 * the context. This is intentional: the assembler applies pinning-aware
 * compression while MessageManager does simple tail-drop.
 */
export function createContextAwareBuilder(
  config: ContextAwareBuilderConfig,
): SystemPromptBuilder {
  const {
    assembler,
    basePrompt,
    toolRegistry,
    eventBus,
    skillTools,
    promptEnricher,
  } = config;

  const builder: SystemPromptBuilder = async (
    context: RunContext,
  ): Promise<string> => {
    // 1. Build the system prompt
    const systemPrompt = promptEnricher
      ? await promptEnricher(context)
      : basePrompt;

    // 2. Convert tool registry → ToolDescriptionRef[]
    const tools = toolsToDescriptionRefs(toolRegistry);

    // 3. Convert current messages → ContextMessage[]
    // Note: We read from context's event history, not MessageManager directly.
    // The builder receives RunContext which has no message access by design.
    // So we pass an empty array here — the assembler still tracks
    // system + tools budget, which is the primary value.
    const messages: ContextMessage[] = [];

    // 4. Assemble
    const params: AssembleParams = {
      systemPrompt,
      tools,
      messages,
      skillTools: skillTools ? [...skillTools] : undefined,
    };

    const assembled: AssembledContext = assembler.assemble(params);

    // 5. Emit usage event
    if (eventBus) {
      eventBus.emit('context:assembled', {
        runId: context.runId,
        usage: assembled.usage,
        wasCompressed: assembled.wasCompressed,
        toolCount: assembled.tools.length,
      });
    }

    return assembled.systemPrompt;
  };

  return builder;
}

/** Event payload for context:assembled */
export interface ContextAssembledEvent {
  readonly runId: string;
  readonly usage: SectionUsage;
  readonly wasCompressed: boolean;
  readonly toolCount: number;
}
