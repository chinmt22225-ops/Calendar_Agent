import asyncio
import base64
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from google.genai import types

from agent.gemini_agent import CalendarAgentSession
from models.chat import ChatImage


def function_call_response(name: str, arguments: dict, call_id: str = "call-1"):
    return types.GenerateContentResponse(candidates=[types.Candidate(
        finish_reason=types.FinishReason.STOP,
        content=types.Content(role="model", parts=[types.Part(
            function_call=types.FunctionCall(id=call_id, name=name, args=arguments)
        )]),
    )])


def text_response(text: str):
    return types.GenerateContentResponse(candidates=[types.Candidate(
        finish_reason=types.FinishReason.STOP,
        content=types.Content(role="model", parts=[types.Part(text=text)]),
    )])


def empty_response():
    return types.GenerateContentResponse(candidates=[types.Candidate(
        finish_reason=types.FinishReason.STOP,
        content=types.Content(role="model", parts=[]),
    )])


class FakeModels:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


class FakeAsyncModels(FakeModels):
    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


class FakeTools:
    timezone = "Asia/Ho_Chi_Minh"

    def __init__(self):
        self.actions = []
        self.executed = []

    def available_tools(self):
        return []

    def execute_tool(self, name, arguments):
        self.executed.append((name, arguments))
        return {"count": 0, "events": []}


def session_with(sync_responses=(), async_responses=()):
    session = CalendarAgentSession.__new__(CalendarAgentSession)
    session.settings = SimpleNamespace(gemini_model="test-model")
    session.tools = FakeTools()
    session.contents = []
    sync_models = FakeModels(sync_responses)
    async_models = FakeAsyncModels(async_responses)
    session.client = SimpleNamespace(
        models=sync_models,
        aio=SimpleNamespace(models=async_models),
    )
    return session, sync_models, async_models


def test_sync_agent_executes_tool_and_returns_grounded_answer():
    session, models, _ = session_with(sync_responses=[
        function_call_response("get_current_schedule", {
            "start_date": "2026-08-16", "end_date": "2026-08-22",
        }),
        text_response("Tuần này chưa có sự kiện nào."),
    ])

    assert session.run("Lịch tuần này có gì?") == "Tuần này chưa có sự kiện nào."
    assert session.tools.executed == [("get_current_schedule", {
        "start_date": "2026-08-16", "end_date": "2026-08-22",
    })]
    function_response = models.calls[1]["contents"][-1].parts[0].function_response
    assert function_response.name == "get_current_schedule"
    assert function_response.response == {"count": 0, "events": []}


def test_image_and_text_survive_multi_step_async_tool_loop():
    session, _, models = session_with(async_responses=[
        function_call_response("get_current_schedule", {
            "start_date": "2026-08-16", "end_date": "2026-08-22",
        }),
        text_response("Mình đã đọc ảnh và cần bạn chọn gộp hay thay thế lịch hiện có."),
    ])
    image = ChatImage(
        mime_type="image/png",
        data=base64.b64encode(b"small-png-fixture").decode(),
    )

    async def collect():
        return [chunk async for chunk in session.stream("Tạo lại lịch trong ảnh", [image])]

    assert asyncio.run(collect()) == [
        "Mình đã đọc ảnh và cần bạn chọn gộp hay thay thế lịch hiện có."
    ]
    first_content = models.calls[0]["contents"][0]
    assert first_content.parts[0].text == "Tạo lại lịch trong ảnh"
    assert first_content.parts[1].inline_data.data == b"small-png-fixture"
    assert session.tools.executed[0][0] == "get_current_schedule"


@pytest.mark.parametrize("async_mode", [False, True])
def test_empty_model_response_is_an_error_not_false_success(async_mode):
    session, _, _ = session_with(
        sync_responses=[] if async_mode else [empty_response()],
        async_responses=[empty_response()] if async_mode else [],
    )

    with pytest.raises(HTTPException) as captured:
        if async_mode:
            async def collect():
                return [chunk async for chunk in session.stream("Xin chào")]
            asyncio.run(collect())
        else:
            session.run("Xin chào")

    assert captured.value.status_code == 502
    assert "phản hồi rỗng" in captured.value.detail
