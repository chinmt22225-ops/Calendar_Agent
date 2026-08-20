from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from db.auth import get_current_user_id
from db.supabase_client import get_supabase
from models.task import StudyTaskCreate, StudyTaskOut, StudyTaskUpdate


router = APIRouter(prefix="/tasks", tags=["study tasks"])


@router.get("", response_model=list[StudyTaskOut])
def list_tasks(
    user_id: UUID = Depends(get_current_user_id), client: Client = Depends(get_supabase)
):
    return (
        client.table("study_tasks")
        .select("*")
        .eq("user_id", str(user_id))
        .order("deadline")
        .execute()
        .data
    )


@router.post("", response_model=StudyTaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: StudyTaskCreate,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    return client.table("study_tasks").insert(
        {**payload.model_dump(mode="json"), "user_id": str(user_id)}
    ).execute().data[0]


@router.patch("/{task_id}", response_model=StudyTaskOut)
def update_task(
    task_id: UUID,
    payload: StudyTaskUpdate,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
):
    rows = (
        client.table("study_tasks")
        .update(payload.model_dump(exclude_none=True, mode="json"))
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

