import asyncio
import hashlib
import json
from datetime import datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask
from supabase import Client

from agent.gemini_agent import (
    CalendarAgentSession,
    fallback_conversation_title,
    generate_conversation_title,
    run_calendar_agent,
)
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
    rows = (
        client.table("chat_messages")
        .select("role,content,metadata,created_at")
        .eq("user_id", str(user_id))
        .eq("conversation_id", str(conversation_id))
        .order("created_at", desc=True)
        .limit(200)
        .execute()
        .data
    )
    return list(reversed(rows))


def _persist_exchange(
    operation_id: UUID,
    conversation_id: UUID,
    is_new: bool,
    user_message: str,
    assistant_message: str,
    actions: list[dict],
    image_count: int,
    user_id: UUID,
    client: Client,
    conversation_title: str | None = None,
) -> dict:
    title = conversation_title or generate_conversation_title(user_message)
    stored = client.rpc(
        "persist_chat_exchange",
        {
            "p_operation_id": str(operation_id),
            "p_conversation_id": str(conversation_id),
            "p_user_id": str(user_id),
            "p_is_new": is_new,
            "p_title": title,
            "p_user_message": user_message,
            "p_user_metadata": {"image_count": image_count} if image_count else {},
            "p_assistant_message": assistant_message,
            "p_assistant_metadata": {"actions": actions},
        },
    ).execute().data
    if not stored:
        raise HTTPException(status_code=503, detail="Không thể lưu lịch sử hội thoại.")
    return stored


def _begin_operation(
    operation_id: UUID,
    conversation_id: UUID,
    request_fingerprint: str,
    user_id: UUID,
    client: Client,
) -> dict:
    result = client.rpc(
        "begin_ai_chat_operation",
        {
            "p_operation_id": str(operation_id),
            "p_user_id": str(user_id),
            "p_conversation_id": str(conversation_id),
            "p_request_fingerprint": request_fingerprint,
        },
    ).execute().data
    if isinstance(result, list):
        result = result[0] if result else None
    if not result:
        raise HTTPException(status_code=503, detail="Không thể khởi tạo yêu cầu AI.")
    return result


def _request_fingerprint(payload: ChatRequest) -> str:
    digest = hashlib.sha256()
    digest.update((str(payload.conversation_id) if payload.conversation_id else "new").encode())
    digest.update(b"\0")
    digest.update(payload.message.strip().encode("utf-8"))
    for image in payload.images:
        digest.update(b"\0")
        digest.update(image.mime_type.encode())
        digest.update(hashlib.sha256(image.as_bytes()).digest())
    return digest.hexdigest()


def _fail_operation(
    operation_id: UUID,
    user_id: UUID,
    detail: str,
    client: Client,
) -> None:
    client.rpc(
        "fail_ai_chat_operation",
        {
            "p_operation_id": str(operation_id),
            "p_user_id": str(user_id),
            "p_error_detail": detail,
        },
    ).execute()


def _generate_title_in_background(
    conversation_id: UUID,
    user_id: UUID,
    user_message: str,
    initial_title: str,
    client: Client,
) -> None:
    current = (
        client.table("conversations")
        .select("id")
        .eq("id", str(conversation_id))
        .eq("user_id", str(user_id))
        .eq("title", initial_title)
        .limit(1)
        .execute()
        .data
    )
    if not current:
        return
    generated = generate_conversation_title(user_message)
    if generated == initial_title:
        return
    client.table("conversations").update({"title": generated}).eq(
        "id", str(conversation_id)
    ).eq("user_id", str(user_id)).eq("title", initial_title).execute()


def _process_chat(payload: ChatRequest, user_id: UUID, client: Client) -> ChatResponse:
    is_new = payload.conversation_id is None
    conversation_id = payload.conversation_id or uuid4()
    operation_id = payload.operation_id or uuid4()
    operation = _begin_operation(
        operation_id, conversation_id, _request_fingerprint(payload), user_id, client
    )
    if not operation.get("created"):
        raise HTTPException(
            status_code=409,
            detail="Yêu cầu AI này đã được xử lý hoặc đang chạy.",
        )
    history = [] if is_new else _load_history(conversation_id, user_id, client)
    try:
        text, actions = run_calendar_agent(payload.message, user_id, client, history, payload.images)
        stored_user_message = payload.message.strip() or f"[Đã gửi {len(payload.images)} ảnh]"
        stored = _persist_exchange(
            operation_id, conversation_id, is_new, stored_user_message, text,
            actions, len(payload.images), user_id, client
        )
    except Exception as exc:
        _fail_operation(operation_id, user_id, str(exc), client)
        raise
    return ChatResponse(
        conversation_id=conversation_id,
        operation_id=operation_id,
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
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    return (
        client.table("conversations")
        .select("id,title,created_at,updated_at")
        .eq("user_id", str(user_id))
        .order("updated_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
        .data
    )


@router.get("/conversations/{conversation_id}", response_model=list[Message])
def get_conversation(
    conversation_id: UUID,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0, le=10_000),
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    _load_history(conversation_id, user_id, client)
    rows = (
        client.table("chat_messages")
        .select("id,role,content,metadata,created_at")
        .eq("user_id", str(user_id))
        .eq("conversation_id", str(conversation_id))
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
        .data
    )
    return list(reversed(rows))


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
    request: Request,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    is_new = payload.conversation_id is None
    operation_id = payload.operation_id or uuid4()
    proposed_conversation_id = payload.conversation_id or uuid4()
    operation = await run_in_threadpool(
        _begin_operation,
        operation_id,
        proposed_conversation_id,
        _request_fingerprint(payload),
        user_id,
        client,
    )
    conversation_id = UUID(str(operation["conversation_id"]))
    if not operation.get("created"):
        if operation.get("status") == "completed":
            async def replay():
                yield _sse({
                    "type": "start",
                    "conversation_id": str(conversation_id),
                    "operation_id": str(operation_id),
                    "replayed": True,
                })
                yield _sse({"type": "token", "content": operation.get("response_text") or ""})
                yield _sse({"type": "actions", "actions": operation.get("actions") or []})
                yield _sse({"type": "done"})

            return StreamingResponse(
                replay(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        raise HTTPException(
            status_code=409,
            detail="Yêu cầu AI này đang chạy hoặc đã thất bại. Hãy tạo operation_id mới để thử lại.",
        )
    history = [] if is_new else await run_in_threadpool(_load_history, conversation_id, user_id, client)
    stored_user_message = payload.message.strip() or f"[Đã gửi {len(payload.images)} ảnh]"
    initial_title = fallback_conversation_title(stored_user_message)

    async def generate():
        yield _sse({
            "type": "start",
            "conversation_id": str(conversation_id),
            "operation_id": str(operation_id),
        })
        session: CalendarAgentSession | None = None
        parts: list[str] = []
        pending_token: asyncio.Task | None = None
        try:
            session = await run_in_threadpool(CalendarAgentSession, user_id, client, history)
            stream = session.stream(payload.message, payload.images).__aiter__()
            while True:
                if pending_token is None:
                    pending_token = asyncio.create_task(anext(stream))
                done, _ = await asyncio.wait({pending_token}, timeout=15)
                if await request.is_disconnected():
                    pending_token.cancel()
                    raise asyncio.CancelledError
                if not done:
                    yield _sse({"type": "heartbeat"})
                    continue
                try:
                    token = pending_token.result()
                except StopAsyncIteration:
                    break
                finally:
                    pending_token = None
                parts.append(token)
                yield _sse({"type": "token", "content": token})
            text = "".join(parts).strip() or "Mình đã xử lý yêu cầu của bạn."
            if not parts:
                yield _sse({"type": "token", "content": text})
            await run_in_threadpool(
                _persist_exchange,
                operation_id,
                conversation_id,
                is_new,
                stored_user_message,
                text,
                session.actions,
                len(payload.images),
                user_id,
                client,
                initial_title,
            )
            yield _sse({"type": "actions", "actions": session.actions})
            yield _sse({"type": "done"})
        except asyncio.CancelledError:
            if pending_token is not None and not pending_token.done():
                pending_token.cancel()
                await asyncio.gather(pending_token, return_exceptions=True)
            # Tool calls may already have changed calendar data. Persist the
            # partial exchange so those mutations remain auditable.
            if session is not None and (parts or session.actions):
                partial_text = "".join(parts).strip() or "Yêu cầu bị ngắt sau khi trợ lý đã cập nhật lịch."
                await asyncio.shield(
                    run_in_threadpool(
                        _persist_exchange,
                        operation_id,
                        conversation_id,
                        is_new,
                        stored_user_message,
                        partial_text,
                        session.actions,
                        len(payload.images),
                        user_id,
                        client,
                        initial_title,
                    )
                )
            else:
                await asyncio.shield(
                    run_in_threadpool(
                        _fail_operation,
                        operation_id,
                        user_id,
                        "Client disconnected before the operation completed",
                        client,
                    )
                )
            raise
        except HTTPException as exc:
            if session is not None and session.actions:
                failure_text = "".join(parts).strip() or "Trợ lý gặp lỗi sau khi đã cập nhật lịch."
                await run_in_threadpool(
                    _persist_exchange,
                    operation_id,
                    conversation_id,
                    is_new,
                    stored_user_message,
                    failure_text,
                    session.actions,
                    len(payload.images),
                    user_id,
                    client,
                    initial_title,
                )
            else:
                await run_in_threadpool(
                    _fail_operation, operation_id, user_id, str(exc.detail), client
                )
            yield _sse({"type": "error", "detail": exc.detail, "status": exc.status_code})
        except Exception as exc:
            if session is not None and session.actions:
                failure_text = "".join(parts).strip() or "Trợ lý gặp lỗi sau khi đã cập nhật lịch."
                await run_in_threadpool(
                    _persist_exchange,
                    operation_id,
                    conversation_id,
                    is_new,
                    stored_user_message,
                    failure_text,
                    session.actions,
                    len(payload.images),
                    user_id,
                    client,
                    initial_title,
                )
            else:
                await run_in_threadpool(
                    _fail_operation, operation_id, user_id, str(exc), client
                )
            yield _sse({"type": "error", "detail": "Trợ lý AI gặp lỗi khi xử lý yêu cầu.", "status": 502})

    background = None
    if is_new:
        background = BackgroundTask(
            _generate_title_in_background,
            conversation_id,
            user_id,
            stored_user_message,
            initial_title,
            client,
        )
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        background=background,
    )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
