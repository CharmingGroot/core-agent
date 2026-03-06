/**
 * Main context assembler.
 * Orchestrates tool filtering, token estimation, budget tracking,
 * and history compression to produce an assembled context window.
 */

import type {
  AssembledContext,
  ContextBudget,
  ContextMessage,
  PinningStrategy,
  SectionUsage,
  ToolDescriptionRef,
} from '@core/types';
import { ContextBudgetTracker } from './context-budget.js';
import {
  estimateTokens,
  estimateToolTokens,
  estimateMessageTokens,
} from './token-estimator.js';
import { HistoryCompressor } from './history-compressor.js';
import { filterToolsBySkill } from './tool-filter.js';

/** Compression triggers when history usage exceeds this ratio of budget */
const COMPRESSION_THRESHOLD = 0.8;

/** Parameters for the assemble method */
export interface AssembleParams {
  readonly systemPrompt: string;
  readonly tools: readonly ToolDescriptionRef[];
  readonly messages: readonly ContextMessage[];
  readonly skillTools?: readonly string[];
}

/**
 * Assembles a complete context window from components.
 * Handles: tool filtering -> token estimation -> budget tracking ->
 * compression if needed -> final assembly.
 */
export class ContextAssembler {
  private readonly budget: ContextBudget;
  private readonly compressor: HistoryCompressor;

  constructor(budget: ContextBudget, pinningStrategy?: PinningStrategy) {
    this.budget = budget;
    this.compressor = new HistoryCompressor(pinningStrategy);
  }

  /**
   * Assemble a context window from the given components.
   * Returns the assembled context with usage information.
   */
  assemble(params: AssembleParams): AssembledContext {
    const tracker = new ContextBudgetTracker(this.budget);

    // 1. Filter tools by skill scope
    const filteredTools = params.skillTools
      ? filterToolsBySkill(params.tools, params.skillTools)
      : [...params.tools];

    // 2. Account for system prompt tokens
    const systemTokens = estimateTokens(params.systemPrompt);
    tracker.addToSection('system', systemTokens);

    // 3. Account for tool description tokens
    const toolTokens = filteredTools.reduce(
      (sum, tool) => sum + estimateToolTokens(tool),
      0,
    );
    tracker.addToSection('tools', toolTokens);

    // 4. Estimate history tokens and compress if needed
    const historyTokens = params.messages.reduce(
      (sum, msg) => sum + estimateMessageTokens(msg),
      0,
    );

    const historyBudget = this.budget.sections.history;
    const compressionThreshold = historyBudget * COMPRESSION_THRESHOLD;
    let wasCompressed = false;
    let finalMessages: readonly ContextMessage[];

    if (historyTokens > compressionThreshold) {
      const compressed = this.compressor.compress(
        params.messages,
        historyBudget,
      );
      finalMessages = compressed.messages;
      tracker.addToSection('history', compressed.compressedTokens);
      wasCompressed = compressed.summarizedCount > 0;
    } else {
      finalMessages = params.messages;
      tracker.addToSection('history', historyTokens);
    }

    // 5. Build usage snapshot
    const usage: SectionUsage = tracker.usage();

    return {
      systemPrompt: params.systemPrompt,
      tools: filteredTools,
      messages: finalMessages,
      usage,
      wasCompressed,
    };
  }
}
