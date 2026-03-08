"""Tests for AgentLoop, SubAgentTool, and ToolDispatcher."""

import json
import pytest
from unittest.mock import AsyncMock

from chameleon import (
    AgentLoop,
    AgentLoopOptions,
    SubAgentTool,
    SubAgentToolConfig,
    Registry,
    ITool,
    ILlmProvider,
    ToolDescription,
    ToolParameter,
    ToolResult,
    ToolCall,
    LlmResponse,
    RunContext,
    JsonObject,
    ToolDispatcher,
)


# ---------------------------------------------------------------------------
# Fixtures: mock provider and tools
# ---------------------------------------------------------------------------


class MockProvider(ILlmProvider):
    """LLM provider that returns pre-configured responses."""

    def __init__(self, responses: list[LlmResponse]) -> None:
        self._responses = list(responses)
        self._call_count = 0

    @property
    def provider_id(self) -> str:
        return "mock"

    async def chat(self, messages, tools=None):
        resp = self._responses[min(self._call_count, len(self._responses) - 1)]
        self._call_count += 1
        return resp

    async def stream(self, messages, tools=None):
        raise NotImplementedError


class EchoTool(ITool):
    """Tool that echoes back the input."""

    @property
    def name(self) -> str:
        return "echo"

    def describe(self) -> ToolDescription:
        return ToolDescription(
            name="echo",
            description="Echoes input",
            parameters=[ToolParameter(name="text", type="string", description="Text to echo")],
        )

    async def execute(self, params: JsonObject, context: RunContext) -> ToolResult:
        return ToolResult(success=True, output=params.get("text", ""))


class AddTool(ITool):
    """Tool that adds two numbers."""

    @property
    def name(self) -> str:
        return "add"

    def describe(self) -> ToolDescription:
        return ToolDescription(
            name="add",
            description="Adds two numbers",
            parameters=[
                ToolParameter(name="a", type="number", description="First number"),
                ToolParameter(name="b", type="number", description="Second number"),
            ],
        )

    async def execute(self, params: JsonObject, context: RunContext) -> ToolResult:
        a = params.get("a", 0)
        b = params.get("b", 0)
        return ToolResult(success=True, output=str(a + b))


# ---------------------------------------------------------------------------
# ToolDispatcher tests
# ---------------------------------------------------------------------------


class TestToolDispatcher:
    def _make_dispatcher(self) -> ToolDispatcher:
        reg: Registry[ITool] = Registry("tools")
        reg.register("echo", EchoTool())
        reg.register("add", AddTool())
        return ToolDispatcher(reg)

    @pytest.mark.asyncio
    async def test_dispatch_known_tool(self):
        d = self._make_dispatcher()
        ctx = RunContext(run_id="test", working_directory=".")
        tc = ToolCall(id="1", name="echo", arguments='{"text": "hello"}')
        result = await d.dispatch(tc, ctx)
        assert result.success
        assert result.output == "hello"

    @pytest.mark.asyncio
    async def test_dispatch_unknown_tool(self):
        d = self._make_dispatcher()
        ctx = RunContext(run_id="test", working_directory=".")
        tc = ToolCall(id="1", name="unknown", arguments="{}")
        result = await d.dispatch(tc, ctx)
        assert not result.success
        assert "Unknown tool" in (result.error or "")

    @pytest.mark.asyncio
    async def test_dispatch_bad_json(self):
        d = self._make_dispatcher()
        ctx = RunContext(run_id="test", working_directory=".")
        tc = ToolCall(id="1", name="echo", arguments="not json")
        result = await d.dispatch(tc, ctx)
        assert not result.success
        assert "JSON" in (result.error or "")

    @pytest.mark.asyncio
    async def test_dispatch_parallel(self):
        d = self._make_dispatcher()
        ctx = RunContext(run_id="test", working_directory=".")
        calls = [
            ToolCall(id="1", name="echo", arguments='{"text": "a"}'),
            ToolCall(id="2", name="add", arguments='{"a": 1, "b": 2}'),
        ]
        results = await d.dispatch_parallel(calls, ctx)
        assert len(results) == 2
        assert results[0].output == "a"
        assert results[1].output == "3"

    def test_get_tool_descriptions(self):
        d = self._make_dispatcher()
        descs = d.get_tool_descriptions()
        names = {desc.name for desc in descs}
        assert names == {"echo", "add"}


# ---------------------------------------------------------------------------
# AgentLoop tests
# ---------------------------------------------------------------------------


class TestAgentLoop:
    @pytest.mark.asyncio
    async def test_simple_chat_no_tools(self):
        """LLM responds directly without tool calls."""
        provider = MockProvider([
            LlmResponse(content="Hello!", stop_reason="end_turn"),
        ])
        reg: Registry[ITool] = Registry("tools")

        loop = AgentLoop(AgentLoopOptions(
            provider=provider,
            tool_registry=reg,
            system_prompt="You are helpful.",
        ))

        result = await loop.run("Hi")
        assert result.content == "Hello!"
        assert result.iterations == 1
        assert not result.aborted

    @pytest.mark.asyncio
    async def test_tool_call_then_response(self):
        """LLM calls a tool, gets result, then responds."""
        provider = MockProvider([
            # First: LLM calls echo tool
            LlmResponse(
                content="",
                stop_reason="tool_use",
                tool_calls=[ToolCall(id="tc1", name="echo", arguments='{"text": "world"}')],
            ),
            # Second: LLM responds with final answer
            LlmResponse(content="The echo said: world", stop_reason="end_turn"),
        ])

        reg: Registry[ITool] = Registry("tools")
        reg.register("echo", EchoTool())

        loop = AgentLoop(AgentLoopOptions(
            provider=provider,
            tool_registry=reg,
        ))

        result = await loop.run("Echo world")
        assert result.content == "The echo said: world"
        assert result.iterations == 2

    @pytest.mark.asyncio
    async def test_parallel_tool_calls(self):
        """LLM calls multiple tools in parallel."""
        provider = MockProvider([
            LlmResponse(
                content="",
                stop_reason="tool_use",
                tool_calls=[
                    ToolCall(id="tc1", name="echo", arguments='{"text": "a"}'),
                    ToolCall(id="tc2", name="add", arguments='{"a": 10, "b": 20}'),
                ],
            ),
            LlmResponse(content="echo=a, sum=30", stop_reason="end_turn"),
        ])

        reg: Registry[ITool] = Registry("tools")
        reg.register("echo", EchoTool())
        reg.register("add", AddTool())

        loop = AgentLoop(AgentLoopOptions(provider=provider, tool_registry=reg))
        result = await loop.run("test")
        assert result.content == "echo=a, sum=30"
        assert result.iterations == 2

    @pytest.mark.asyncio
    async def test_max_iterations(self):
        """Loop stops at max_iterations even if LLM keeps calling tools."""
        provider = MockProvider([
            LlmResponse(
                content="",
                stop_reason="tool_use",
                tool_calls=[ToolCall(id="tc1", name="echo", arguments='{"text": "loop"}')],
            ),
        ] * 10)  # Always calls tools

        reg: Registry[ITool] = Registry("tools")
        reg.register("echo", EchoTool())

        loop = AgentLoop(AgentLoopOptions(
            provider=provider,
            tool_registry=reg,
            max_iterations=3,
        ))

        result = await loop.run("test")
        assert result.iterations == 3


# ---------------------------------------------------------------------------
# SubAgentTool tests
# ---------------------------------------------------------------------------


class TestSubAgentTool:
    def test_describe(self):
        provider = MockProvider([])
        reg: Registry[ITool] = Registry("sub-tools")
        tool = SubAgentTool(SubAgentToolConfig(
            name="researcher",
            description="Research agent",
            provider=provider,
            tool_registry=reg,
        ))

        desc = tool.describe()
        assert desc.name == "researcher"
        assert len(desc.parameters) == 1
        assert desc.parameters[0].name == "task"

    @pytest.mark.asyncio
    async def test_execute_delegates_to_child_loop(self):
        """SubAgentTool runs a child AgentLoop that responds."""
        child_provider = MockProvider([
            LlmResponse(content="Research result: AI is cool", stop_reason="end_turn"),
        ])

        reg: Registry[ITool] = Registry("sub-tools")
        tool = SubAgentTool(SubAgentToolConfig(
            name="researcher",
            description="Research agent",
            provider=child_provider,
            tool_registry=reg,
            system_prompt="You are a researcher.",
        ))

        ctx = RunContext(run_id="parent", working_directory=".")
        result = await tool.execute({"task": "Tell me about AI"}, ctx)
        assert result.success
        assert "AI is cool" in result.output

    @pytest.mark.asyncio
    async def test_execute_with_tools_in_child(self):
        """SubAgent uses its scoped tools."""
        child_provider = MockProvider([
            LlmResponse(
                content="",
                stop_reason="tool_use",
                tool_calls=[ToolCall(id="tc1", name="add", arguments='{"a": 5, "b": 3}')],
            ),
            LlmResponse(content="5 + 3 = 8", stop_reason="end_turn"),
        ])

        reg: Registry[ITool] = Registry("sub-tools")
        reg.register("add", AddTool())

        tool = SubAgentTool(SubAgentToolConfig(
            name="calculator_agent",
            description="Calculator agent",
            provider=child_provider,
            tool_registry=reg,
        ))

        ctx = RunContext(run_id="parent", working_directory=".")
        result = await tool.execute({"task": "Calculate 5 + 3"}, ctx)
        assert result.success
        assert "8" in result.output

    @pytest.mark.asyncio
    async def test_execute_empty_task_fails(self):
        provider = MockProvider([])
        reg: Registry[ITool] = Registry("sub-tools")
        tool = SubAgentTool(SubAgentToolConfig(
            name="test",
            description="test",
            provider=provider,
            tool_registry=reg,
        ))

        ctx = RunContext(run_id="parent", working_directory=".")
        result = await tool.execute({"task": ""}, ctx)
        assert not result.success
        assert "empty" in (result.error or "").lower()

    @pytest.mark.asyncio
    async def test_is_itool_instance(self):
        """SubAgentTool implements ITool interface."""
        provider = MockProvider([])
        reg: Registry[ITool] = Registry("sub-tools")
        tool = SubAgentTool(SubAgentToolConfig(
            name="test",
            description="test",
            provider=provider,
            tool_registry=reg,
        ))
        assert isinstance(tool, ITool)


# ---------------------------------------------------------------------------
# Runtime dynamic registration test
# ---------------------------------------------------------------------------


class TestRuntimeRegistration:
    @pytest.mark.asyncio
    async def test_register_sub_agent_at_runtime(self):
        """Sub-agent added to registry is visible to dispatcher."""
        reg: Registry[ITool] = Registry("tools")
        reg.register("echo", EchoTool())
        assert len(reg) == 1

        # Runtime: add a sub-agent
        provider = MockProvider([
            LlmResponse(content="sub result", stop_reason="end_turn"),
        ])
        sub_reg: Registry[ITool] = Registry("sub")
        sub_reg.register("echo", EchoTool())

        reg.register("my_sub_agent", SubAgentTool(SubAgentToolConfig(
            name="my_sub_agent",
            description="Dynamic sub-agent",
            provider=provider,
            tool_registry=sub_reg,
        )))

        assert len(reg) == 2
        assert "my_sub_agent" in reg

        # Dispatcher sees the new tool
        d = ToolDispatcher(reg)
        descs = d.get_tool_descriptions()
        names = {desc.name for desc in descs}
        assert "my_sub_agent" in names

    @pytest.mark.asyncio
    async def test_unregister_sub_agent_at_runtime(self):
        """Sub-agent removed from registry is no longer visible."""
        reg: Registry[ITool] = Registry("tools")
        provider = MockProvider([])
        sub_reg: Registry[ITool] = Registry("sub")

        reg.register("agent_a", SubAgentTool(SubAgentToolConfig(
            name="agent_a", description="A", provider=provider, tool_registry=sub_reg,
        )))
        assert "agent_a" in reg

        reg.unregister("agent_a")
        assert "agent_a" not in reg
