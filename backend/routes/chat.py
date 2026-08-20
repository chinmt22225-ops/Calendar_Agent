import asyncio
import json
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from supabase import Client

from agent.gemini_agent import run_calendar_agent
from db.auth import get_current_user_id
from db.supabase_client import get_supabase
from models.chat import CalendarAction, ChatRequest, ChatResponse, Message


router = APIRouter(prefix="/chat", tags=["AI chat"])


def _process_chat(payload: ChatRequest, user_id: UUID, client: Client) -> ChatResponse:
    conversation_id = payload.conversation_id or uuid4()
    history = (
        client.table("chat_messages")
        .select("role,content,metadata,created_at")
        .eq("user_id", str(user_id))
        .eq("conversation_id", str(conversation_id))
        .order("created_at")
        .execute()
        .data
    )
    client.table("chat_messages").insert(
        {
            "user_id": str(user_id),
            "conversation_id": str(conversation_id),
            "role": "user",
            "content": payload.message,
            "metadata": {},
        }
    ).execute()

    text, actions = run_calendar_agent(payload.message, user_id, client, history)
    created_at = datetime.now(timezone.utc)
    stored = client.table("chat_messages").insert(
        {
            "user_id": str(user_id),
            "conversation_id": str(conversation_id),
            "role": "assistant",
            "content": text,
            "metadata": {"actions": actions},
        }
    ).execute().data[0]
    return ChatResponse(
        conversation_id=conversation_id,
        message=Message(
            id=UUID(stored["id"]), role="assistant", content=text, metadata={"actions": actions},
            created_at=datetime.fromisoformat(stored.get("created_at", created_at.isoformat()).replace("Z", "+00:00")),
        ),
        actions=[CalendarAction.model_validate(action) for action in actions],
    )


@router.get("/conversations")
def list_conversations(
    user_id: UUID = Depends(get_current_user_id), client: Client = Depends(get_supabase)
):
    rows = (
        client.table("chat_messages")
        .select("conversation_id,role,content,created_at")
        .eq("user_id", str(user_id))
        .order("created_at", desc=True)
        .limit(200)
        .execute()
        .data
    )
    conversations: dict[str, dict] = {}
    for row in rows:
        key = row["conversation_id"]
        item = conversations.setdefault(
            key,
            {"id": key, "title": "Đoạn chat mới", "updated_at": row["created_at"]},
        )
        if row["role"] == "user":
            item["title"] = row["content"][:52]
    return list(conversations.values())


@router.get("/conversations/{conversation_id}", response_model=list[Message])
def get_conversation(
    conversation_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    return (
        client.table("chat_messages")
        .select("id,role,content,metadata,created_at")
        .eq("user_id", str(user_id))
        .eq("conversation_id", str(conversation_id))
        .order("created_at")
        .execute()
        .data
    )


@router.post("", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    return await run_in_threadpool(_process_chat, payload, user_id, client)


@router.post("/stream")
async def stream_chat(
    payload: ChatRequest,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    response = await run_in_threadpool(_process_chat, payload, user_id, client)

    async def generate():
        yield f"data: {json.dumps({'type': 'start', 'conversation_id': str(response.conversation_id)})}\n\n"
        words = response.message.content.split(" ")
        for index, word in enumerate(words):
            token = word if index == 0 else f" {word}"
            yield f"data: {json.dumps({'type': 'token', 'content': token}, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.012)
        yield f"data: {json.dumps({'type': 'actions', 'actions': [a.model_dump() for a in response.actions]}, ensure_ascii=False)}\n\n"
        yield "data: {\"type\": \"done\"}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

