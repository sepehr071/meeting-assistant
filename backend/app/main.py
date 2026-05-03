from contextlib import asynccontextmanager
from typing import Literal, cast

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings.audio_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="Meeting Assistant", lifespan=lifespan)

# CORS: regex form takes precedence; otherwise use the comma-split list of
# exact origins. Both let the deployment switch ports/hosts without code
# changes.
_cors_kwargs: dict = {
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if settings.ALLOWED_ORIGIN_REGEX:
    _cors_kwargs["allow_origin_regex"] = settings.ALLOWED_ORIGIN_REGEX
else:
    _cors_kwargs["allow_origins"] = settings.allowed_origins

app.add_middleware(CORSMiddleware, **_cors_kwargs)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SESSION_SECRET,
    session_cookie=settings.SESSION_COOKIE_NAME,
    max_age=settings.SESSION_MAX_AGE_S,
    same_site=cast(Literal["lax", "strict", "none"], settings.SESSION_SAME_SITE),
    https_only=settings.SESSION_COOKIE_SECURE,
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


from app.routers import auth, chat, meetings, realtime, series, stats, tags

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(meetings.router, prefix="/api/meetings", tags=["meetings"])
app.include_router(
    chat.router,
    prefix="/api/meetings/{meeting_id}/chat",
    tags=["chat"],
)
app.include_router(realtime.router, prefix="/api/realtime", tags=["realtime"])
app.include_router(series.router, prefix="/api/series", tags=["series"])
app.include_router(stats.router, prefix="/api/stats", tags=["stats"])
app.include_router(tags.router, prefix="/api/tags", tags=["tags"])
