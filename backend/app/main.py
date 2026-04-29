import re
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings.audio_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="Meeting Assistant", lifespan=lifespan)

_allow_regex = settings.ALLOWED_ORIGIN_REGEX or rf"^{re.escape(settings.ALLOWED_ORIGIN)}$"

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=_allow_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


from app.routers import chat, meetings, realtime, series, tags

app.include_router(meetings.router, prefix="/api/meetings", tags=["meetings"])
app.include_router(
    chat.router,
    prefix="/api/meetings/{meeting_id}/chat",
    tags=["chat"],
)
app.include_router(realtime.router, prefix="/api/realtime", tags=["realtime"])
app.include_router(series.router, prefix="/api/series", tags=["series"])
app.include_router(tags.router, prefix="/api/tags", tags=["tags"])
