from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client

from db.auth import get_current_user_id
from db.supabase_client import get_supabase
from models.task import StudyTaskCreate, StudyTaskOut, StudyTaskUpdate


router = APIRouter(prefix="/tasks", tags=["study tasks"])


@router.get("", response_model=list[StudyTaskOut])
def list_tasks(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0, le=10_000),
    user_id: UUID = Depends(get_current_user_id), client: Client = Depends(get_supabase)
):
    return (
        client.table("study_tasks")
        .select("*")
        .eq("user_id", str(user_id))
        .order("deadline")
        .range(offset, offset + limit - 1)
        .execute()
        .data
    )


@router.post("", response_model=StudyTaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: StudyTaskCreate,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    rows = client.table("study_tasks").insert(
        {**payload.model_dump(mode="json"), "user_id": str(user_id)}
    ).execute().data
    if not rows:
        raise HTTPException(status_code=503, detail="Không thể tạo nhiệm vụ lúc này.")
    return rows[0]


@router.patch("/{task_id}", response_model=StudyTaskOut)
def update_task(
    task_id: UUID,
    payload: StudyTaskUpdate,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    changes = payload.model_dump(exclude_unset=True, mode="json")
    if not changes:
        raise HTTPException(status_code=400, detail="Không có thay đổi nào.")
    rows = (
        client.table("study_tasks")
        .update(changes)
        .eq("id", str(task_id))
        .eq("user_id", str(user_id))
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhiệm vụ.")
    return rows[0]


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    rows = (
        client.table("study_tasks")
        .delete()
        .eq("id", str(task_id))
        .eq("user_id", str(user_id))
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhiệm vụ.")
