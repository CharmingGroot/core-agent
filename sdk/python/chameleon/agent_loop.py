"""
AgentLoop — Core agent execution loop.
Python port of @cli-agent/agent AgentLoop.

Cycle: user message → LLM → tool calls → tool results → LLM → ...
Stops when LLM returns end_turn or max_iterations reached.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any

from .types import (
    ILlmProvider,
    ITool,
    ToolCall,
    ToolDescription,
    LlmResponse,
    RunContext,
)
from .registry import Registry
from .tool_dispatcher import ToolDispatcher

logger = logging.getLogger(__name__)

DEFAULT_MAX_ITERATIONS = 25


@dataclass
class AgentResult:
    content: str
    iterations: int
    aborted: bool = False


@dataclass
class AgentLoopOptions:
    provider: ILlmProvider
    tool_registry: Registry[ITool]
    system_prompt: str = ""
    max_iterations: int = DEFAULT_MAX_ITERATIONS
    working_directory: str = "."


class AgentLoop:
    """
    Autonomous agent loop.

    ```python
    loop = AgentLoop(AgentLoopOptions(
        provider=my_provider,
        tool_registry=my_registry,
        system_prompt="You are a helpful agent.",
    ))
    result = await loop.run("Search for latest AI news")
    print(result.content)
    ```
    """

    def __init__(self, options: AgentLoopOptions) -> None:
        self._provider = options.provider
        self._dispatcher = ToolDispatcher(options.tool_registry)
        self._system_prompt = options.system_prompt
        self._max_iterations = options.max_iterations
        self._context = RunContext(
            run_id=str(uuid.uuid4()),
            working_directory=options.working_directory,
        )
        self._messages: list[dict[str, Any]] = []

    def abort(self, reason: str = "aborted") -> None:
        self._context.abort()

    async def run(self, user_message: str) -> AgentResult:
        """Run the agent loop until completion or max iterations."""
        # Build initial messages
        if self._system_prompt:
            self._messages.append({"role": "system", "content": self._system_prompt})

        self._messages.append({"role": "user", "content": user_message})

        tools = self._dispatcher.get_tool_descriptions()
        last_content = ""

        for iteration in range(1, self._max_iterations + 1):
            if self._context.aborted:
                return AgentResult(
                    content=last_content,
                    iterations=iteration,
                    aborted=True,
                )

            logger.debug("Iteration %d/%d", iteration, self._max_iterations)

            response = await self._provider.chat(
                self._messages,
                tools if tools else None,
            )

            last_content = response.content

            # Append assistant message
            assistant_msg: dict[str, Any] = {
                "role": "assistant",
                "content": response.content,
            }
            if response.tool_calls:
                assistant_msg["tool_calls"] = [
                    {
                        "id": tc.id,
                        "name": tc.name,
                        "arguments": tc.arguments,
                    }
                    for tc in response.tool_calls
                ]
            self._messages.append(assistant_msg)

            # If no tool calls, we're done
            if not response.tool_calls:
                return AgentResult(
                    content=response.content,
                    iterations=iteration,
                )

            # Execute tool calls (parallel)
            results = await self._dispatcher.dispatch_parallel(
                response.tool_calls, self._context
            )

            # Append tool results as messages
            for tc, result in zip(response.tool_calls, results):
                content = result.output if result.success else f"Error: {result.error}"
                self._messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": content,
                })

        # Max iterations reached
        return AgentResult(
            content=last_content,
            iterations=self._max_iterations,
        )
