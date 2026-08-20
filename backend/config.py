from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Calendar Agent API"
    app_env: str = "development"
    frontend_url: str = "http://localhost:5173"
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_service_role_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    default_timezone: str = "Asia/Bangkok"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def gemini_configured(self) -> bool:
        return bool(self.gemini_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()

