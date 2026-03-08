"""
OpenAI LLM provider — Python port of @cli-agent/providers OpenAIProvider.
"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

from openai import AsyncOpenAI

from ..types import (
    ILlmProvider,
    LlmResponse,
    StreamEvent,
    ToolCall,
    ToolDescription,
    TokenUsage,
)

logger = logging.getLogger(__name__)


class OpenAIProvider(ILlmProvider):
    """Async OpenAI chat completions provider."""

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o",
        max_tokens: int = 4096,
        temperature: float = 0.7,
        base_url: str | None = None,
    ) -> None:
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model
        self._max_tokens = max_tokens
        self._temperature = temperature

    @property
    def provider_id(self) -> str:
        return "openai"

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[ToolDescription] | None = None,
    ) -> LlmResponse:
        kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": self._max_tokens,
            "temperature": self._temperature,
            "messages": self._to_openai_messages(messages),
        }

        openai_tools = self._to_openai_tools(tools) if tools else None
        if openai_tools:
            kwargs["tools"] = openai_tools

        response = await self._client.chat.completions.create(**kwargs)

        choice = response.choices[0]
        tool_calls = [
            ToolCall(
                id=tc.id,
                name=tc.function.name,
                arguments=tc.function.arguments,
            )
            for tc in (choice.message.tool_calls or [])
        ]

        stop_reason = (
            "tool_use"
            if choice.finish_reason == "tool_calls"
            else "max_tokens"
            if choice.finish_reason == "length"
            else "end_turn"
        )

        return LlmResponse(
            content=choice.message.content or "",
            stop_reason=stop_reason,
            tool_calls=tool_calls,
            usage=TokenUsage(
                input_tokens=response.usage.prompt_tokens if response.usage else 0,
                output_tokens=response.usage.completion_tokens if response.usage else 0,
            ),
        )

    async def stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[ToolDescription] | None = None,
    ) -> AsyncIterator[StreamEvent]:
        kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": self._max_tokens,
            "temperature": self._temperature,
            "messages": self._to_openai_messages(messages),
            "stream": True,
        }

        openai_tools = self._to_openai_tools(tools) if tools else None
        if openai_tools:
            kwargs["tools"] = openai_tools

        stream = await self._client.chat.completions.create(**kwargs)

        content = ""
        tool_calls: list[ToolCall] = []

        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta is None:
                continue

            if delta.content:
                content += delta.content
                yield StreamEvent(type="text_delta", content=delta.content)

            if delta.tool_calls:
                for tc in delta.tool_calls:
                    if tc.id:
                        tool_calls.append(
                            ToolCall(
                                id=tc.id,
                                name=tc.function.name if tc.function else "",
                                arguments=tc.function.arguments if tc.function else "",
                            )
                        )
                        yield StreamEvent(type="tool_call_start", content=tc.function.name if tc.function else "")
                    elif tc.function and tc.function.arguments:
                        if tool_calls:
                            last = tool_calls[-1]
                            tool_calls[-1] = ToolCall(
                                id=last.id,
                                name=last.name,
                                arguments=last.arguments + tc.function.arguments,
                            )
                        yield StreamEvent(type="tool_call_delta", content=tc.function.arguments)

            finish = chunk.choices[0].finish_reason if chunk.choices else None
            if finish:
                stop_reason = (
                    "tool_use" if finish == "tool_calls"
                    else "max_tokens" if finish == "length"
                    else "end_turn"
                )
                yield StreamEvent(
                    type="done",
                    response=LlmResponse(
                        content=content,
                        stop_reason=stop_reason,
                        tool_calls=tool_calls,
                    ),
                )

    # ----- helpers -----

    @staticmethod
    def _to_openai_messages(
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for msg in messages:
            role = msg.get("role", "user")
            if role == "tool":
                result.append({
                    "role": "tool",
                    "tool_call_id": msg.get("tool_call_id", ""),
                    "content": msg.get("content", ""),
                })
            elif role == "assistant" and "tool_calls" in msg:
                result.append({
                    "role": "assistant",
                    "content": msg.get("content") or None,
                    "tool_calls": [
                        {
                            "id": tc["id"],
                            "type": "function",
                            "function": {
                                "name": tc["name"],
                                "arguments": tc["arguments"],
                            },
                        }
                        for tc in msg["tool_calls"]
                    ],
                })
            else:
                result.append({"role": role, "content": msg.get("content", "")})
        return result

    @staticmethod
    def _to_openai_tools(
        tools: list[ToolDescription],
    ) -> list[dict[str, Any]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": {
                        "type": "object",
                        "properties": {
                            p.name: {"type": p.type, "description": p.description}
                            for p in t.parameters
                        },
                        "required": [p.name for p in t.parameters if p.required],
                    },
                },
            }
            for t in tools
        ]
