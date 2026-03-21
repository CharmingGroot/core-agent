export type SpanKind = 'agent' | 'llm' | 'tool';

export interface Span {
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly traceId: string;
  readonly kind: SpanKind;
  readonly name: string;
  readonly startedAt: number;      // epoch ms
  readonly endedAt: number;        // epoch ms
  readonly durationMs: number;
  readonly attributes: SpanAttributes;
  readonly status: 'ok' | 'error';
  readonly error?: string;
}

export interface SpanAttributes {
  // agent span
  'agent.runId'?: string;
  'agent.model'?: string;
  'agent.iterations'?: number;
  'agent.reason'?: string;
  // llm span
  'llm.model'?: string;
  'llm.inputTokens'?: number;
  'llm.outputTokens'?: number;
  'llm.stopReason'?: string;
  // tool span
  'tool.name'?: string;
  'tool.success'?: boolean;
  'tool.callId'?: string;
  [key: string]: unknown;
}

export interface Trace {
  readonly traceId: string;
  readonly runId: string;
  readonly model: string;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly durationMs?: number;
  readonly spans: Span[];
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly status: 'running' | 'ok' | 'error';
}

export interface ITraceExporter {
  export(trace: Trace): void | Promise<void>;
}
