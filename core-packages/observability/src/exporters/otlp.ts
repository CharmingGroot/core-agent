import type { Trace, Span } from '../types.js';
import type { ITraceExporter } from '../types.js';

/**
 * Exports traces as OpenTelemetry OTLP/HTTP JSON to a collector endpoint.
 * Compatible with: Jaeger, Grafana Tempo, Honeycomb, Datadog, etc.
 *
 * Default endpoint: http://localhost:4318/v1/traces  (OTLP HTTP)
 */
export class OtlpExporter implements ITraceExporter {
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;

  constructor(options: {
    endpoint?: string;
    headers?: Record<string, string>;
  } = {}) {
    this.endpoint = options.endpoint ?? 'http://localhost:4318/v1/traces';
    this.headers = { 'Content-Type': 'application/json', ...options.headers };
  }

  async export(trace: Trace): Promise<void> {
    const payload = toOtlpPayload(trace);
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });
    } catch {
      // Non-fatal: silently drop if collector unreachable
    }
  }
}

// ── OTLP JSON encoding ────────────────────────────────────────────────────────

function toOtlpPayload(trace: Trace) {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            kv('service.name', 'core-agent'),
            kv('agent.model', trace.model),
          ],
        },
        scopeSpans: [
          {
            scope: { name: '@core/observability', version: '0.0.1' },
            spans: trace.spans.map(s => toOtlpSpan(s, trace)),
          },
        ],
      },
    ],
  };
}

function toOtlpSpan(span: Span, trace: Trace) {
  return {
    traceId: hexId(trace.traceId),
    spanId: hexId(span.spanId),
    parentSpanId: span.parentSpanId ? hexId(span.parentSpanId) : undefined,
    name: span.name,
    kind: spanKindToOtlp(span.kind),
    startTimeUnixNano: String(span.startedAt * 1_000_000),
    endTimeUnixNano: String(span.endedAt * 1_000_000),
    attributes: Object.entries(span.attributes)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => kv(k, v as string | number | boolean)),
    status: {
      code: span.status === 'ok' ? 1 : 2,
      message: span.error ?? '',
    },
  };
}

function spanKindToOtlp(kind: Span['kind']): number {
  // OTLP SpanKind: INTERNAL=1, CLIENT=3
  if (kind === 'llm') return 3; // CLIENT — external call
  return 1; // INTERNAL
}

function hexId(uuid: string): string {
  return uuid.replace(/-/g, '');
}

function kv(key: string, value: string | number | boolean | unknown) {
  if (typeof value === 'number' && Number.isInteger(value))
    return { key, value: { intValue: String(value) } };
  if (typeof value === 'number')
    return { key, value: { doubleValue: value } };
  if (typeof value === 'boolean')
    return { key, value: { boolValue: value } };
  return { key, value: { stringValue: String(value) } };
}
