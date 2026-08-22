from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError
from supabase import Client

from db.auth import get_current_user_id
from db.supabase_client import get_supabase
from models.event import EventCreate, EventOut, EventUpdate


router = APIRouter(prefix="/events", tags=["events"])
MAX_EVENT_QUERY_DAYS = 366


def _rpc_row(data: object) -> dict | None:
    if isinstance(data, list):
        data = data[0] if data else None
    return data if isinstance(data, dict) else None


@router.get("", response_model=list[EventOut])
def list_events(
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=50_000),
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    for boundary in (start, end):
        if boundary is not None and boundary.utcoffset() is None:
            raise HTTPException(status_code=422, detail="Khoảng thời gian phải kèm múi giờ.")
    if start and end:
        if end <= start:
            raise HTTPException(status_code=422, detail="end phải sau start.")
        if (end - start).days > MAX_EVENT_QUERY_DAYS:
            raise HTTPException(
                status_code=422,
                detail=f"Chỉ được tải tối đa {MAX_EVENT_QUERY_DAYS} ngày mỗi lần.",
            )
    query = client.table("events").select("*").eq("user_id", str(user_id)).is_("deleted_at", "null")
    if start:
        query = query.or_(f"end_time.gt.{start.isoformat()},recurrence_end.gte.{start.date().isoformat()}")
    if end:
        query = query.lt("start_time", end.isoformat())
    return query.order("start_time").range(offset, offset + limit - 1).execute().data


@router.get("/trash", response_model=list[EventOut])
def list_deleted_events(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0, le=10_000),
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    return (
        client.table("events")
        .select("*")
        .eq("user_id", str(user_id))
        .not_.is_("deleted_at", "null")
        .order("deleted_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
        .data
    )


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: EventCreate,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    row = _rpc_row(client.rpc("create_calendar_event_atomic", {
        "p_user_id": str(user_id),
        "p_event": payload.model_dump(mode="json"),
    }).execute().data)
    if not row:
        raise HTTPException(status_code=503, detail="Không thể tạo sự kiện lúc này.")
    return row


@router.patch("/{event_id}", response_model=EventOut)
def update_event(
    event_id: UUID,
    payload: EventUpdate,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    changes = payload.model_dump(exclude_unset=True, mode="json")
    if not changes:
        raise HTTPException(status_code=400, detail="Không có thay đổi nào.")
    current_rows = (
        client.table("events")
        .select("*")
        .eq("id", str(event_id))
        .eq("user_id", str(user_id))
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
        .data
    )
    if not current_rows:
        raise HTTPException(status_code=404, detail="Không tìm thấy sự kiện.")
    candidate = {**current_rows[0], **changes}
    try:
        normalized = EventCreate.model_validate(candidate).model_dump(mode="json")
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail="Dữ liệu sự kiện sau khi cập nhật không hợp lệ.",
        ) from exc
    updated = _rpc_row(client.rpc("update_calendar_event_atomic", {
        "p_user_id": str(user_id),
        "p_event_id": str(event_id),
        "p_event": normalized,
    }).execute().data)
    if not updated:
        raise HTTPException(status_code=503, detail="Không thể cập nhật sự kiện lúc này.")
    return updated


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    rows = (
        client.table("events")
        .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", str(event_id))
        .eq("user_id", str(user_id))
        .is_("deleted_at", "null")
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Không tìm thấy sự kiện.")


@router.post("/{event_id}/restore", response_model=EventOut)
def restore_event(
    event_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    rows = (
        client.table("events")
        .select("*")
        .eq("id", str(event_id))
        .eq("user_id", str(user_id))
        .not_.is_("deleted_at", "null")
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Không tìm thấy sự kiện trong Thùng rác.")
    restored = _rpc_row(client.rpc("restore_calendar_event_atomic", {
        "p_user_id": str(user_id),
        "p_event_id": str(event_id),
    }).execute().data)
    if not restored:
        raise HTTPException(status_code=503, detail="Không thể khôi phục sự kiện lúc này.")
    return restored


@router.delete("/{event_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
def permanently_delete_event(
    event_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    rows = (
        client.table("events")
        .delete()
        .eq("id", str(event_id))
        .eq("user_id", str(user_id))
        .not_.is_("deleted_at", "null")
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Không tìm thấy sự kiện trong Thùng rác.")
