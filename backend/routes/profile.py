from uuid import UUID
from datetime import time

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from db.auth import get_current_user_id
from db.supabase_client import get_supabase
from models.profile import ProfileOut, ProfileUpdate


router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileOut)
def get_profile(
    user_id: UUID = Depends(get_current_user_id), client: Client = Depends(get_supabase)
):
    rows = client.table("profiles").select("*").eq("id", str(user_id)).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Chưa có hồ sơ người dùng.")
    return rows[0]


@router.patch("", response_model=ProfileOut)
def update_profile(
    payload: ProfileUpdate,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    changes = payload.model_dump(exclude_unset=True, mode="json")
    if not changes:
        raise HTTPException(status_code=400, detail="Không có thay đổi nào.")
    current_rows = (
        client.table("profiles")
        .select("*")
        .eq("id", str(user_id))
        .limit(1)
        .execute()
        .data
    )
    current = current_rows[0] if current_rows else {
        "day_start": time(7, 0).isoformat(),
        "day_end": time(22, 0).isoformat(),
    }
    # Validate the effective pair even when callers update only one boundary.
    ProfileUpdate.model_validate({**current, **changes})
    rows = client.table("profiles").upsert({"id": str(user_id), **changes}).execute().data
    if not rows:
        raise HTTPException(status_code=503, detail="Không thể lưu hồ sơ lúc này.")
    return rows[0]
