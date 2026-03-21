import { randomUUID } from 'crypto';
import type { EventBus } from '@cli-agent/core';
import type { Span, Trace, ITraceExporter, SpanAttributes } from './types.js';

/**
 * Subscribes to an EventBus and builds Trace + Span objects.
 * Core (@cli-agent/core) has zero dependency on this class.
 *
 * Usage:
 *   const collector = new TraceCollector(agentLoop.eventBus, [new ConsoleExporter()]);
 */
export class TraceCollector {
  private readonly exporters: ITraceExporter[];
  private readonly traces = new Map<string, MutableTrace>();
  private readonly toolStartTimes = new Map<string, number>(); // callId → startedAt
  private readonly cleanupFns: Array<() => void> = [];

  constructor(eventBus: EventBus, exporters: ITraceExporter[] = []) {
    this.exporters = exporters;
    this.attach(eventBus);
  }

  private attach(bus: EventBus): void {
    this.cleanupFns.push(
      bus.on('agent:start', ({ runId, model, startedAt }) => {
        const traceId = randomUUID();
        this.traces.set(runId, {
          traceId,
          runId,
          model,
          startedAt,
          spans: [],
          totalInputTokens: 0,
          totalOutputTokens: 0,
          status: 'running',
        });
      }),

      bus.on('agent:end', ({ runId, reason, durationMs, iterations }) => {
        const trace = this.traces.get(runId);
        if (!trace) return;

        // Root agent span
        const span = makeSpan({
          traceId: trace.traceId,
          kind: 'agent',
          name: `agent:run`,
          startedAt: trace.startedAt,
          durationMs,
          status: reason === 'aborted' ? 'error' : 'ok',
          attributes: {
            'agent.runId': runId,
            'agent.model': trace.model,
            'agent.iterations': iterations,
            'agent.reason': reason,
          },
        });

        trace.spans.unshift(span); // root span first
        trace.endedAt = trace.startedAt + durationMs;
        trace.durationMs = durationMs;
        trace.status = reason === 'aborted' ? 'error' : 'ok';

        this.flush(runId);
      }),

      bus.on('agent:error', ({ runId, error }) => {
        const trace = this.traces.get(runId);
        if (!trace) return;
        trace.status = 'error';

        const span = makeSpan({
          traceId: trace.traceId,
          kind: 'agent',
          name: 'agent:error',
          startedAt: trace.startedAt,
          durationMs: Date.now() - trace.startedAt,
          status: 'error',
          error: error.message,
          attributes: { 'agent.runId': runId },
        });

        trace.spans.unshift(span);
        this.flush(runId);
      }),

      bus.on('llm:response', ({ runId, response, durationMs, model }) => {
        const trace = this.traces.get(runId);
        if (!trace) return;

        trace.totalInputTokens += response.usage.inputTokens;
        trace.totalOutputTokens += response.usage.outputTokens;

        const endedAt = Date.now();
        const span = makeSpan({
          traceId: trace.traceId,
          kind: 'llm',
          name: `llm:${model}`,
          startedAt: endedAt - durationMs,
          durationMs,
          status: response.stopReason === 'error' ? 'error' : 'ok',
          attributes: {
            'llm.model': model,
            'llm.inputTokens': response.usage.inputTokens,
            'llm.outputTokens': response.usage.outputTokens,
            'llm.stopReason': response.stopReason,
          },
        });

        trace.spans.push(span);
      }),

      bus.on('tool:start', ({ toolCall, startedAt }) => {
        this.toolStartTimes.set(toolCall.id, startedAt);
      }),

      bus.on('tool:end', ({ runId, toolCall, result, durationMs }) => {
        const trace = this.traces.get(runId);
        if (!trace) return;

        const startedAt = this.toolStartTimes.get(toolCall.id) ?? (Date.now() - durationMs);
        this.toolStartTimes.delete(toolCall.id);

        const span = makeSpan({
          traceId: trace.traceId,
          kind: 'tool',
          name: `tool:${toolCall.name}`,
          startedAt,
          durationMs,
          status: result.success ? 'ok' : 'error',
          error: result.error,
          attributes: {
            'tool.name': toolCall.name,
            'tool.callId': toolCall.id,
            'tool.success': result.success,
          },
        });

        trace.spans.push(span);
      }),
    );
  }

  /** Manually retrieve a running trace (e.g., for streaming dashboards) */
  getTrace(runId: string): Readonly<MutableTrace> | undefined {
    return this.traces.get(runId);
  }

  /** All completed traces */
  getAllTraces(): Readonly<MutableTrace>[] {
    return Array.from(this.traces.values()).filter(t => t.status !== 'running');
  }

  detach(): void {
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns.length = 0;
  }

  private flush(runId: string): void {
    const trace = this.traces.get(runId);
    if (!trace) return;

    const frozen: Trace = {
      traceId: trace.traceId,
      runId: trace.runId,
      model: trace.model,
      startedAt: trace.startedAt,
      endedAt: trace.endedAt,
      durationMs: trace.durationMs,
      spans: [...trace.spans],
      totalInputTokens: trace.totalInputTokens,
      totalOutputTokens: trace.totalOutputTokens,
      status: trace.status,
    };

    for (const exporter of this.exporters) {
      Promise.resolve(exporter.export(frozen)).catch(console.error);
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

interface MutableTrace {
  traceId: string;
  runId: string;
  model: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  spans: Span[];
  totalInputTokens: number;
  totalOutputTokens: number;
  status: 'running' | 'ok' | 'error';
}

interface SpanOptions {
  traceId: string;
  parentSpanId?: string;
  kind: Span['kind'];
  name: string;
  startedAt: number;
  durationMs: number;
  status: 'ok' | 'error';
  error?: string;
  attributes: SpanAttributes;
}

function makeSpan(opts: SpanOptions): Span {
  return {
    spanId: randomUUID(),
    parentSpanId: opts.parentSpanId,
    traceId: opts.traceId,
    kind: opts.kind,
    name: opts.name,
    startedAt: opts.startedAt,
    endedAt: opts.startedAt + opts.durationMs,
    durationMs: opts.durationMs,
    attributes: opts.attributes,
    status: opts.status,
    error: opts.error,
  };
}
