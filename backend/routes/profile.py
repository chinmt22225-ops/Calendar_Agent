from uuid import UUID

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
    row = {"id": str(user_id), **payload.model_dump(exclude_none=True, mode="json")}
    return client.table("profiles").upsert(row).execute().data[0]

