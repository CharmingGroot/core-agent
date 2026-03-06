import pino from 'pino';

export type AgentLogger = pino.Logger;
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LOG_LEVEL_KEY = 'CLI_AGENT_LOG_LEVEL';
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

function getLogLevel(): LogLevel {
  const envLevel = process.env[LOG_LEVEL_KEY];
  if (envLevel && isValidLogLevel(envLevel)) {
    return envLevel;
  }
  return DEFAULT_LOG_LEVEL;
}

function isValidLogLevel(level: string): level is LogLevel {
  return ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(level);
}

export function createLogger(name: string, level?: LogLevel): pino.Logger {
  return pino({
    name,
    level: level ?? getLogLevel(),
    transport:
      process.env['NODE_ENV'] !== 'production'
        ? { target: 'pino/file', options: { destination: 1 } }
        : undefined,
  });
}

let rootLogger: pino.Logger | undefined;

export function getRootLogger(): pino.Logger {
  if (!rootLogger) {
    rootLogger = createLogger('cli-agent');
  }
  return rootLogger;
}

export function createChildLogger(name: string): pino.Logger {
  return getRootLogger().child({ module: name });
}
