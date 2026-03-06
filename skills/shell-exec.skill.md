# shell-exec

Execute shell commands with caution. Prefer non-destructive, read-only commands when possible.

## Tools

- shell_exec

## Rules

- Never execute destructive commands (rm -rf, drop, truncate) without explicit user approval
- Set appropriate timeouts for long-running commands
- Prefer read-only commands (ls, cat, git status) over mutating ones
- Validate command arguments before execution
- Do not pipe sensitive data to external services
- Avoid commands that require interactive input (use non-interactive flags)
- Chain commands with && to fail fast on errors

## Governed Rules

- All shell commands require admin approval in governed mode
- Commands are logged with full arguments and exit codes to audit trail
- Network-accessing commands (curl, wget, ssh) require elevated approval
- Only whitelisted commands are allowed; unknown commands are blocked
- Execution is sandboxed to prevent filesystem escape
