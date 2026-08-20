from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client

from db.auth import get_current_user_id
from db.supabase_client import get_supabase
from models.event import EventCreate, EventOut, EventUpdate


router = APIRouter(prefix="/events", tags=["events"])


def _find_conflict(client: Client, user_id: UUID, start: datetime, end: datetime, exclude_id: UUID | None = None):
    query = (
        client.table("events")
        .select("id,title")
        .eq("user_id", str(user_id))
        .lt("start_time", end.isoformat())
        .gt("end_time", start.isoformat())
    )
    if exclude_id:
        query = query.neq("id", str(exclude_id))
    rows = query.limit(1).execute().data
    return rows[0] if rows else None


@router.get("", response_model=list[EventOut])
def list_events(
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    query = client.table("events").select("*").eq("user_id", str(user_id))
    if start:
        query = query.gt("end_time", start.isoformat())
    if end:
        query = query.lt("start_time", end.isoformat())
    return query.order("start_time").execute().data


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: EventCreate,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    conflict = _find_conflict(client, user_id, payload.start_time, payload.end_time)
    if conflict:
        raise HTTPException(status_code=409, detail=f"Khung giờ đang trùng với '{conflict['title']}'.")
    row = {**payload.model_dump(mode="json"), "user_id": str(user_id)}
    return client.table("events").insert(row).execute().data[0]


@router.patch("/{event_id}", response_model=EventOut)
def update_event(
    event_id: UUID,
    payload: EventUpdate,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    changes = payload.model_dump(exclude_none=True, mode="json")
    if not changes:
        raise HTTPException(status_code=400, detail="Không có thay đổi nào.")
    current_rows = (
        client.table("events").select("*").eq("id", str(event_id)).eq("user_id", str(user_id)).limit(1).execute().data
    )
    if not current_rows:
        raise HTTPException(status_code=404, detail="Không tìm thấy sự kiện.")
    current = current_rows[0]
    merged_start = payload.start_time or datetime.fromisoformat(current["start_time"].replace("Z", "+00:00"))
    merged_end = payload.end_time or datetime.fromisoformat(current["end_time"].replace("Z", "+00:00"))
    if merged_end <= merged_start:
        raise HTTPException(status_code=422, detail="Thời gian kết thúc phải sau thời gian bắt đầu.")
    conflict = _find_conflict(client, user_id, merged_start, merged_end, event_id)
    if conflict:
        raise HTTPException(status_code=409, detail=f"Khung giờ đang trùng với '{conflict['title']}'.")
    rows = (
        client.table("events")
        .update(changes)
        .eq("id", str(event_id))
        .eq("user_id", str(user_id))
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
        .delete()
        .eq("id", str(event_id))
        .eq("user_id", str(user_id))
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Không tìm thấy sự kiện.")
