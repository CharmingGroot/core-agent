# file-read

Read files to understand content before taking action. Always verify file exists before processing.

## Tools

- file_read

## Rules

- Use relative paths from working directory
- Check file encoding when dealing with non-UTF-8 files
- Do not attempt to read binary files
- Read the specific sections needed, not entire large files unnecessarily
- When reading configuration files, validate structure before extracting values
- Prefer targeted reads (offset + limit) for files over 500 lines

## Governed Rules

- Log every file read operation to audit trail
- Restrict reads to files within the allowed domain scope
- Sensitive file patterns (.env, credentials, private keys) require approval
