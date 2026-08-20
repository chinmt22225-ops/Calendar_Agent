from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from routes import chat, events, profile, tasks


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(events.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(profile.router, prefix="/api")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "supabase_configured": settings.supabase_configured,
        "gemini_configured": settings.gemini_configured,
    }

