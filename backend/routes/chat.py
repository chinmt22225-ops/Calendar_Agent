import json
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from supabase import Client

from agent.gemini_agent import CalendarAgentSession, generate_conversation_title, run_calendar_agent
from db.auth import get_current_user_id
from db.rate_limit import enforce_chat_rate_limit
from db.supabase_client import get_supabase
from models.chat import CalendarAction, ChatRequest, ChatResponse, ConversationUpdate, Message


router = APIRouter(prefix="/chat", tags=["AI chat"])


def _load_history(conversation_id: UUID, user_id: UUID, client: Client) -> list[dict]:
    conversation = (
        client.table("conversations")
        .select("id")
        .eq("id", str(conversation_id))
        .eq("user_id", str(user_id))
        .limit(1)
        .execute()
        .data
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Không tìm thấy cuộc hội thoại.")
    return (
        client.table("chat_messages")
        .select("role,content,metadata,created_at")
        .eq("user_id", str(user_id))
        .eq("conversation_id", str(conversation_id))
        .order("created_at")
        .execute()
        .data
    )


def _persist_exchange(
    conversation_id: UUID,
    is_new: bool,
    user_message: str,
    assistant_message: str,
    actions: list[dict],
    user_id: UUID,
    client: Client,
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    if is_new:
        client.table("conversations").insert({
            "id": str(conversation_id),
            "user_id": str(user_id),
            "title": generate_conversation_title(user_message),
        }).execute()
    else:
        client.table("conversations").update({"updated_at": now}).eq(
            "id", str(conversation_id)
        ).eq("user_id", str(user_id)).execute()
    stored = client.table("chat_messages").insert([
        {
            "user_id": str(user_id),
            "conversation_id": str(conversation_id),
            "role": "user",
            "content": user_message,
            "metadata": {},
        },
        {
            "user_id": str(user_id),
            "conversation_id": str(conversation_id),
            "role": "assistant",
            "content": assistant_message,
            "metadata": {"actions": actions},
        },
    ]).execute().data
    return stored[-1]


def _process_chat(payload: ChatRequest, user_id: UUID, client: Client) -> ChatResponse:
    is_new = payload.conversation_id is None
    conversation_id = payload.conversation_id or uuid4()
    history = [] if is_new else _load_history(conversation_id, user_id, client)
    text, actions = run_calendar_agent(payload.message, user_id, client, history)
    stored = _persist_exchange(
        conversation_id, is_new, payload.message, text, actions, user_id, client
    )
    return ChatResponse(
        conversation_id=conversation_id,
        message=Message(
            id=UUID(stored["id"]),
            role="assistant",
            content=text,
            metadata={"actions": actions},
            created_at=datetime.fromisoformat(stored["created_at"].replace("Z", "+00:00")),
        ),
        actions=[CalendarAction.model_validate(action) for action in actions],
    )


@router.get("/conversations")
def list_conversations(
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    return (
        client.table("conversations")
        .select("id,title,created_at,updated_at")
        .eq("user_id", str(user_id))
        .order("updated_at", desc=True)
        .execute()
        .data
    )


@router.get("/conversations/{conversation_id}", response_model=list[Message])
def get_conversation(
    conversation_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    _load_history(conversation_id, user_id, client)
    return (
        client.table("chat_messages")
        .select("id,role,content,metadata,created_at")
        .eq("user_id", str(user_id))
        .eq("conversation_id", str(conversation_id))
        .order("created_at")
        .execute()
        .data
    )


@router.patch("/conversations/{conversation_id}")
def rename_conversation(
    conversation_id: UUID,
    payload: ConversationUpdate,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    rows = (
        client.table("conversations")
        .update({"title": payload.title.strip()})
        .eq("id", str(conversation_id))
        .eq("user_id", str(user_id))
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Không tìm thấy cuộc hội thoại.")
    return rows[0]


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    rows = (
        client.table("conversations")
        .delete()
        .eq("id", str(conversation_id))
        .eq("user_id", str(user_id))
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Không tìm thấy cuộc hội thoại.")


@router.post("", response_model=ChatResponse, dependencies=[Depends(enforce_chat_rate_limit)])
async def chat(
    payload: ChatRequest,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    return await run_in_threadpool(_process_chat, payload, user_id, client)


@router.post("/stream", dependencies=[Depends(enforce_chat_rate_limit)])
async def stream_chat(
    payload: ChatRequest,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    is_new = payload.conversation_id is None
    conversation_id = payload.conversation_id or uuid4()
    history = [] if is_new else await run_in_threadpool(_load_history, conversation_id, user_id, client)

    async def generate():
        yield _sse({"type": "start", "conversation_id": str(conversation_id)})
        try:
            session = CalendarAgentSession(user_id, client, history)
            parts: list[str] = []
            async for token in session.stream(payload.message):
                parts.append(token)
                yield _sse({"type": "token", "content": token})
            text = "".join(parts).strip() or "Mình đã xử lý yêu cầu của bạn."
            if not parts:
                yield _sse({"type": "token", "content": text})
            await run_in_threadpool(
                _persist_exchange,
                conversation_id,
                is_new,
                payload.message,
                text,
                session.actions,
                user_id,
                client,
            )
            yield _sse({"type": "actions", "actions": session.actions})
            yield _sse({"type": "done"})
        except HTTPException as exc:
            yield _sse({"type": "error", "detail": exc.detail, "status": exc.status_code})
        except Exception:
            yield _sse({"type": "error", "detail": "Trợ lý AI gặp lỗi khi xử lý yêu cầu.", "status": 502})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
