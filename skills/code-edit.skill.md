# code-edit

Modify code files following a strict read-verify-write cycle. Never write blindly.

## Tools

- file_read
- file_write
- file_search

## Rules

- Always read the file before modifying it
- Make minimal, focused changes — do not refactor beyond scope
- Preserve existing code style and formatting
- Do not introduce security vulnerabilities
- Verify the edit achieved its intended purpose
- One logical change per edit operation
- After editing, call the reflect tool to verify compliance
- If multiple files need changes, edit them in dependency order

## Governed Rules

- All code edits require admin approval in governed mode
- Edits are logged with before/after diffs to audit trail
- Reflection is mandatory after every code-edit in governed mode
- Edits to configuration files require elevated approval
- Changes must stay within the assigned domain scope
