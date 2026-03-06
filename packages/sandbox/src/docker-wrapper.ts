import Docker from 'dockerode';
import { Readable } from 'node:stream';
import type { SandboxConfig, ExecutionRequest, ExecutionResult, ISandbox } from '@cli-agent/core';
import { SandboxError, createChildLogger } from '@cli-agent/core';
import type { Logger } from 'pino';

const LANGUAGE_COMMANDS: Record<string, string[]> = {
  javascript: ['node', '-e'],
  typescript: ['npx', 'tsx', '-e'],
  python: ['python3', '-c'],
  bash: ['bash', '-c'],
  sh: ['sh', '-c'],
};

export class DockerSandbox implements ISandbox {
  containerId = '';
  private container: Docker.Container | undefined;
  private readonly docker: Docker;
  private readonly logger: Logger;
  private config: SandboxConfig | undefined;

  constructor(docker?: Docker) {
    this.docker = docker ?? new Docker();
    this.logger = createChildLogger('docker-sandbox');
  }

  async initialize(config: SandboxConfig): Promise<void> {
    this.config = config;
    try {
      const container = await this.docker.createContainer({
        Image: config.image,
        Cmd: ['tail', '-f', '/dev/null'],
        WorkingDir: config.workDir,
        HostConfig: {
          Memory: config.memoryLimitMb * 1024 * 1024,
          NanoCpus: config.cpuLimit * 1e9,
          NetworkMode: 'none',
        },
      });
      this.container = container;
      this.containerId = container.id;
      await container.start();
      this.logger.info({ containerId: this.containerId }, 'Sandbox initialized');
    } catch (error) {
      throw new SandboxError(
        `Failed to initialize sandbox: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    if (!this.container || !this.config) {
      throw new SandboxError('Sandbox not initialized. Call initialize() first.');
    }

    const timeoutMs = request.timeoutMs ?? this.config.timeoutMs;
    const command = this.buildCommand(request);
    const startTime = Date.now();

    try {
      const exec = await this.container.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
        AttachStdin: !!request.stdin,
      });

      const stream = await exec.start({ hijack: true, stdin: !!request.stdin });

      if (request.stdin) {
        const stdinStream = Readable.from([request.stdin]);
        stdinStream.pipe(stream);
      }

      const { stdout, stderr, timedOut } = await this.collectOutput(stream, timeoutMs);
      const durationMs = Date.now() - startTime;

      const inspectResult = await exec.inspect();
      const exitCode = timedOut ? -1 : (inspectResult.ExitCode ?? -1);

      return { exitCode, stdout, stderr, timedOut, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      if (error instanceof SandboxError) throw error;
      throw new SandboxError(
        `Execution failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async destroy(): Promise<void> {
    if (!this.container) return;
    try {
      await this.container.stop({ t: 1 });
      await this.container.remove({ force: true });
      this.logger.info({ containerId: this.containerId }, 'Sandbox destroyed');
    } catch (error) {
      this.logger.warn(
        { containerId: this.containerId, error },
        'Failed to destroy sandbox cleanly'
      );
    } finally {
      this.container = undefined;
      this.containerId = '';
    }
  }

  private buildCommand(request: ExecutionRequest): string[] {
    const lang = request.language.toLowerCase();
    const cmdPrefix = LANGUAGE_COMMANDS[lang];
    if (!cmdPrefix) {
      throw new SandboxError(`Unsupported language: ${request.language}`);
    }
    return [...cmdPrefix, request.code];
  }

  private collectOutput(
    stream: NodeJS.ReadableStream,
    timeoutMs: number
  ): Promise<{ stdout: string; stderr: string; timedOut: boolean }> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        stream.destroy();
        resolve({ stdout, stderr: stderr + '\n[Execution timed out]', timedOut });
      }, timeoutMs);

      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        clearTimeout(timeout);
        const data = Buffer.concat(chunks).toString('utf-8');
        // Docker multiplexed stream: first 8 bytes per frame are header
        // For simplicity, treat all as stdout; stderr demux would need docker-modem
        stdout = data;
        resolve({ stdout, stderr, timedOut });
      });
      stream.on('error', () => {
        clearTimeout(timeout);
        resolve({ stdout, stderr, timedOut });
      });
    });
  }
}
