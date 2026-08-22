import logging
from uuid import uuid4

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError as PostgrestAPIError

from config import get_settings
from routes import chat, events, profile, tasks


settings = get_settings()
logger = logging.getLogger(__name__)
is_production = settings.app_env.lower() == "production"
app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
)
raw_origins = [o.strip() for o in settings.frontend_url.split(",") if o.strip()]
origins = list(
    set(
        raw_origins
        + [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
        ]
    )
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(events.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(profile.router, prefix="/api")


@app.middleware("http")
async def attach_request_id(request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.exception_handler(PostgrestAPIError)
async def handle_postgrest_error(request, exc: PostgrestAPIError):
    code = str(getattr(exc, "code", ""))
    message = str(getattr(exc, "message", "") or "")
    details = str(getattr(exc, "details", "") or "")
    hint = str(getattr(exc, "hint", "") or "")
    if code in {"23P01", "23503", "23505"}:
        status_code, detail = 409, "Dữ liệu đang xung đột với một bản ghi khác."
        if code == "23P01" and "calendar_conflict:" in message:
            title = message.split("calendar_conflict:", 1)[1].splitlines()[0].strip()
            detail = f"Khung giờ đang trùng với '{title}'."
    elif code in {"22007", "22023", "22P02", "23502", "23514"}:
        status_code, detail = 422, "Dữ liệu không thỏa điều kiện hợp lệ."
    elif code == "P0002":
        status_code, detail = 404, "Không tìm thấy dữ liệu yêu cầu."
    elif code == "42501":
        status_code, detail = 403, "Bạn không có quyền thực hiện thao tác này."
    else:
        status_code, detail = 503, "Dịch vụ dữ liệu tạm thời không khả dụng."
    logger.warning(
        "PostgREST request failed request_id=%s code=%s message=%r details=%r hint=%r",
        getattr(request.state, "request_id", "unknown"),
        code,
        message[:300],
        details[:300],
        hint[:300],
    )
    return JSONResponse(
        status_code=status_code,
        content={"detail": detail, "request_id": getattr(request.state, "request_id", None)},
    )


@app.exception_handler(httpx.HTTPError)
async def handle_upstream_http_error(request, exc: httpx.HTTPError):
    logger.warning(
        "Upstream request failed request_id=%s type=%s",
        getattr(request.state, "request_id", "unknown"),
        type(exc).__name__,
    )
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Dịch vụ phụ trợ tạm thời không khả dụng.",
            "request_id": getattr(request.state, "request_id", None),
        },
    )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "supabase_configured": settings.supabase_configured,
        "gemini_configured": settings.gemini_configured,
    }


@app.get("/ready")
def readiness():
    if not settings.supabase_configured or not settings.gemini_configured:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "detail": "Thiếu cấu hình dịch vụ bắt buộc."},
        )
    return {"status": "ready"}
