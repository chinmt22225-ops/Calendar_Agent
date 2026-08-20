from functools import lru_cache

from fastapi import HTTPException, status
from supabase import Client, create_client

from config import get_settings


@lru_cache
def get_supabase() -> Client:
    settings = get_settings()
    if not settings.supabase_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase chưa được cấu hình. Hãy bổ sung backend/.env.",
        )
    return create_client(settings.supabase_url, settings.supabase_service_role_key)

