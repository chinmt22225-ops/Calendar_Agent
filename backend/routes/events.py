from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client

from agent.recurrence import events_overlap
from db.auth import get_current_user_id
from db.supabase_client import get_supabase
from models.event import EventCreate, EventOut, EventUpdate


router = APIRouter(prefix="/events", tags=["events"])


def _scheduled_events(client: Client, user_id: UUID) -> list[dict]:
    return (
        client.table("events")
        .select("*")
        .eq("user_id", str(user_id))
        .eq("status", "scheduled")
        .is_("deleted_at", "null")
        .order("start_time")
        .execute()
        .data
    )


def _raise_on_conflict(client: Client, user_id: UUID, candidate: dict, exclude_id: UUID | None = None) -> None:
    if candidate.get("status", "scheduled") != "scheduled":
        return
    conflict = events_overlap(
        candidate,
        _scheduled_events(client, user_id),
        str(exclude_id) if exclude_id else None,
    )
    if conflict:
        raise HTTPException(status_code=409, detail=f"Khung giờ đang trùng với '{conflict['title']}'.")


@router.get("", response_model=list[EventOut])
def list_events(
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    query = client.table("events").select("*").eq("user_id", str(user_id)).is_("deleted_at", "null")
    if start:
        query = query.or_(f"end_time.gt.{start.isoformat()},recurrence_end.gte.{start.date().isoformat()}")
    if end:
        query = query.lt("start_time", end.isoformat())
    return query.order("start_time").execute().data


@router.get("/trash", response_model=list[EventOut])
def list_deleted_events(
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    return (
        client.table("events")
        .select("*")
        .eq("user_id", str(user_id))
        .not_.is_("deleted_at", "null")
        .order("deleted_at", desc=True)
        .execute()
        .data
    )


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: EventCreate,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    row = {**payload.model_dump(mode="json"), "user_id": str(user_id)}
    _raise_on_conflict(client, user_id, row)
    return client.table("events").insert(row).execute().data[0]


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
    normalized = EventCreate.model_validate(candidate).model_dump(mode="json")
    _raise_on_conflict(client, user_id, normalized, event_id)
    rows = (
        client.table("events")
        .update(changes)
        .eq("id", str(event_id))
        .eq("user_id", str(user_id))
        .is_("deleted_at", "null")
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Không tìm thấy sự kiện.")
    return rows[0]


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
    candidate = {**rows[0], "deleted_at": None}
    _raise_on_conflict(client, user_id, candidate, event_id)
    restored = (
        client.table("events")
        .update({"deleted_at": None})
        .eq("id", str(event_id))
        .eq("user_id", str(user_id))
        .execute()
        .data
    )
    return restored[0]


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
