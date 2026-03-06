# file-write

Write or modify files carefully. Always read before writing to understand existing content and conventions.

## Tools

- file_write

## Rules

- Always read the target file before modifying it
- Preserve existing code style and conventions
- Modify only what was explicitly requested
- Create parent directories if they don't exist
- Never overwrite files without reading them first
- Validate that the written content is syntactically correct for its file type
- Keep file length under 300 lines; split into modules if exceeded

## Governed Rules

- All write operations require admin approval in governed mode
- Log file path, size delta, and change summary to audit trail
- Writes outside the designated workspace directory are blocked
- Backup original file content before overwriting
