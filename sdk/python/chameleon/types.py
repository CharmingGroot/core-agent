"""
Core type definitions — Python port of @cli-agent/core types.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Literal

# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------

JsonValue = str | int | float | bool | None | dict[str, Any] | list[Any]
JsonObject = dict[str, Any]

# ---------------------------------------------------------------------------
# Tool types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ToolParameter:
    name: str
    type: str  # "string" | "number" | "boolean" | "object" | "array"
    description: str
    required: bool = True


@dataclass(frozen=True)
class ToolDescription:
    name: str
    description: str
    parameters: list[ToolParameter] = field(default_factory=list)


@dataclass
class ToolResult:
    success: bool
    output: str
    error: str | None = None


class ITool(ABC):
    """Interface every tool must implement."""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    def describe(self) -> ToolDescription: ...

    @abstractmethod
    async def execute(self, params: JsonObject, context: RunContext) -> ToolResult: ...


# ---------------------------------------------------------------------------
# LLM types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: str  # JSON string


@dataclass(frozen=True)
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0


StopReason = Literal["end_turn", "tool_use", "max_tokens"]


@dataclass
class LlmResponse:
    content: str
    stop_reason: StopReason
    tool_calls: list[ToolCall] = field(default_factory=list)
    usage: TokenUsage = field(default_factory=TokenUsage)


@dataclass
class StreamEvent:
    type: str  # "text_delta" | "tool_call_start" | "tool_call_delta" | "done"
    content: str | None = None
    response: LlmResponse | None = None


class ILlmProvider(ABC):
    """Interface every LLM provider must implement."""

    @property
    @abstractmethod
    def provider_id(self) -> str: ...

    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[ToolDescription] | None = None,
    ) -> LlmResponse: ...

    @abstractmethod
    async def stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[ToolDescription] | None = None,
    ) -> AsyncIterator[StreamEvent]: ...


# ---------------------------------------------------------------------------
# RunContext
# ---------------------------------------------------------------------------


@dataclass
class RunContext:
    run_id: str
    working_directory: str
    aborted: bool = False

    def abort(self) -> None:
        self.aborted = True
