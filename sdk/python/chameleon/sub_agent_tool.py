"""
SubAgentTool — Wraps an AgentLoop as an ITool.
Python port of @cli-agent/agent SubAgentTool.

The parent agent calls this like any other tool:
  news_researcher(task="오늘 한국 뉴스 검색해줘")

Internally it spawns a child AgentLoop that runs autonomously.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from .types import (
    ITool,
    ILlmProvider,
    ToolDescription,
    ToolParameter,
    ToolResult,
    RunContext,
    JsonObject,
)
from .registry import Registry
from .agent_loop import AgentLoop, AgentLoopOptions

logger = logging.getLogger(__name__)

DEFAULT_SUB_MAX_ITERATIONS = 10


@dataclass
class SubAgentToolConfig:
    """Configuration for creating a sub-agent tool."""

    name: str
    description: str
    provider: ILlmProvider
    tool_registry: Registry[ITool]
    system_prompt: str = ""
    max_iterations: int = DEFAULT_SUB_MAX_ITERATIONS


class SubAgentTool(ITool):
    """
    An ITool that delegates work to a child AgentLoop.

    ```python
    tool = SubAgentTool(SubAgentToolConfig(
        name="news_researcher",
        description="뉴스 전문 리서치",
        provider=provider,
        tool_registry=search_tools,
        system_prompt="당신은 뉴스 전문 리서치 에이전트입니다.",
    ))
    registry.register("news_researcher", tool)
    ```
    """

    def __init__(self, config: SubAgentToolConfig) -> None:
        self._config = config

    @property
    def name(self) -> str:
        return self._config.name

    def describe(self) -> ToolDescription:
        return ToolDescription(
            name=self._config.name,
            description=self._config.description,
            parameters=[
                ToolParameter(
                    name="task",
                    type="string",
                    description="The task to delegate to the sub-agent",
                    required=True,
                ),
            ],
        )

    async def execute(self, params: JsonObject, context: RunContext) -> ToolResult:
        task = params.get("task", "")
        if not isinstance(task, str) or not task.strip():
            return ToolResult(
                success=False,
                output="",
                error='Missing or empty "task" parameter',
            )

        logger.info("Sub-agent '%s' starting: %s", self._config.name, task[:200])

        child_loop = AgentLoop(
            AgentLoopOptions(
                provider=self._config.provider,
                tool_registry=self._config.tool_registry,
                system_prompt=self._config.system_prompt,
                max_iterations=self._config.max_iterations,
                working_directory=context.working_directory,
            )
        )

        # Propagate abort
        if context.aborted:
            return ToolResult(
                success=False,
                output="",
                error="Parent context already aborted",
            )

        try:
            result = await child_loop.run(task)

            logger.info(
                "Sub-agent '%s' completed: iterations=%d, aborted=%s",
                self._config.name,
                result.iterations,
                result.aborted,
            )

            if result.aborted:
                return ToolResult(
                    success=False,
                    output=result.content,
                    error="Sub-agent was aborted",
                )

            return ToolResult(success=True, output=result.content)

        except Exception as e:
            logger.exception("Sub-agent '%s' failed", self._config.name)
            return ToolResult(
                success=False,
                output="",
                error=f"Sub-agent error: {e}",
            )
