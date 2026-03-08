"""
Chameleon Agent Framework — Python SDK.

Lightweight, zero-dependency (except openai) agent framework.
Drop-in replacement for LangChain/deepagents agent orchestration.

Usage:
    from chameleon import AgentLoop, AgentLoopOptions, SubAgentTool, Registry

    registry = Registry("tools")
    registry.register("my_tool", my_tool)

    loop = AgentLoop(AgentLoopOptions(
        provider=OpenAIProvider(api_key="..."),
        tool_registry=registry,
        system_prompt="You are a helpful agent.",
    ))
    result = await loop.run("Hello!")
"""

from .types import (
    ITool,
    ILlmProvider,
    ToolParameter,
    ToolDescription,
    ToolResult,
    ToolCall,
    LlmResponse,
    StreamEvent,
    TokenUsage,
    RunContext,
    JsonObject,
)
from .registry import Registry, RegistryError
from .agent_loop import AgentLoop, AgentLoopOptions, AgentResult
from .sub_agent_tool import SubAgentTool, SubAgentToolConfig
from .tool_dispatcher import ToolDispatcher
from .providers import OpenAIProvider

__all__ = [
    # Types
    "ITool",
    "ILlmProvider",
    "ToolParameter",
    "ToolDescription",
    "ToolResult",
    "ToolCall",
    "LlmResponse",
    "StreamEvent",
    "TokenUsage",
    "RunContext",
    "JsonObject",
    # Core
    "Registry",
    "RegistryError",
    "AgentLoop",
    "AgentLoopOptions",
    "AgentResult",
    "SubAgentTool",
    "SubAgentToolConfig",
    "ToolDispatcher",
    # Providers
    "OpenAIProvider",
]
