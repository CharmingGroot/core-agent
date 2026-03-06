# file-search

Search for files using glob patterns. Use precise patterns to minimize unnecessary results.

## Tools

- file_search

## Rules

- Use specific glob patterns, avoid overly broad searches like **/*
- Exclude node_modules, .git, and build directories
- Limit results to what is actually needed
- Combine with file_read to verify search results
- When searching for code patterns, prefer content grep over filename glob
- Narrow scope progressively: start specific, broaden only if needed

## Governed Rules

- Search scope is restricted to the assigned domain directories
- Log search patterns and result counts to audit trail
- Searches returning more than 100 results must be refined before processing
