"""
ToolDispatcher — Resolves tool calls from the LLM and executes them.
Python port of @cli-agent/agent ToolDispatcher.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

from .types import ToolCall, ToolDescription, ToolResult, RunContext

if TYPE_CHECKING:
    from .registry import Registry
    from .types import ITool

logger = logging.getLogger(__name__)

MAX_OUTPUT_CHARS = 80_000
TRUNCATION_NOTICE = "\n... [truncated — output exceeded 80 000 chars]"


class ToolDispatcher:
    def __init__(self, tool_registry: Registry[ITool]) -> None:
        self._registry = tool_registry

    async def dispatch(
        self,
        tool_call: ToolCall,
        context: RunContext,
    ) -> ToolResult:
        tool = self._registry.try_get(tool_call.name)
        if tool is None:
            return ToolResult(
                success=False,
                output="",
                error=f"Unknown tool: {tool_call.name}",
            )

        try:
            params = json.loads(tool_call.arguments) if tool_call.arguments else {}
        except json.JSONDecodeError as e:
            return ToolResult(
                success=False,
                output="",
                error=f"Invalid tool arguments JSON: {e}",
            )

        try:
            result = await tool.execute(params, context)
        except Exception as e:
            logger.exception("Tool %s execution error", tool_call.name)
            return ToolResult(
                success=False,
                output="",
                error=f"Tool execution error: {e}",
            )

        # Truncate oversized output
        if len(result.output) > MAX_OUTPUT_CHARS:
            result = ToolResult(
                success=result.success,
                output=result.output[:MAX_OUTPUT_CHARS] + TRUNCATION_NOTICE,
                error=result.error,
            )

        return result

    async def dispatch_parallel(
        self,
        tool_calls: list[ToolCall],
        context: RunContext,
    ) -> list[ToolResult]:
        """Execute multiple tool calls concurrently."""
        import asyncio

        tasks = [self.dispatch(tc, context) for tc in tool_calls]
        return list(await asyncio.gather(*tasks))

    def get_tool_descriptions(self) -> list[ToolDescription]:
        return [tool.describe() for tool in self._registry.get_all().values()]
