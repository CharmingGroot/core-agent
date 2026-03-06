export class AgentError extends Error {
  readonly code: string;
  readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.cause = cause;
  }
}

export class RegistryError extends AgentError {
  constructor(message: string, cause?: Error) {
    super(message, 'REGISTRY_ERROR', cause);
    this.name = 'RegistryError';
  }
}

export class ConfigError extends AgentError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONFIG_ERROR', cause);
    this.name = 'ConfigError';
  }
}

export class ProviderError extends AgentError {
  constructor(message: string, cause?: Error) {
    super(message, 'PROVIDER_ERROR', cause);
    this.name = 'ProviderError';
  }
}

export class ToolExecutionError extends AgentError {
  readonly toolName: string;

  constructor(toolName: string, message: string, cause?: Error) {
    super(message, 'TOOL_EXECUTION_ERROR', cause);
    this.name = 'ToolExecutionError';
    this.toolName = toolName;
  }
}

export class SandboxError extends AgentError {
  constructor(message: string, cause?: Error) {
    super(message, 'SANDBOX_ERROR', cause);
    this.name = 'SandboxError';
  }
}

export class PermissionDeniedError extends AgentError {
  readonly toolName: string;

  constructor(toolName: string) {
    super(`Permission denied for tool: ${toolName}`, 'PERMISSION_DENIED');
    this.name = 'PermissionDeniedError';
    this.toolName = toolName;
  }
}

export class AbortError extends AgentError {
  constructor(message = 'Operation aborted') {
    super(message, 'ABORT_ERROR');
    this.name = 'AbortError';
  }
}
