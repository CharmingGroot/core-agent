export interface SandboxConfig {
  readonly image: string;
  readonly memoryLimitMb: number;
  readonly cpuLimit: number;
  readonly timeoutMs: number;
  readonly workDir: string;
}

export interface ExecutionRequest {
  readonly code: string;
  readonly language: string;
  readonly timeoutMs?: number;
  readonly stdin?: string;
}

export interface ExecutionResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly durationMs: number;
}

export interface ISandbox {
  readonly containerId: string;
  initialize(config: SandboxConfig): Promise<void>;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
  destroy(): Promise<void>;
}
