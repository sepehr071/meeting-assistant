from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_session
from app.models import Series, User
from app.schemas import RealtimeToken, RealtimeTokenRequest
from app.services import glossary
from app.services.realtime_token import issue_realtime_token

router = APIRouter()


@router.post("/token", response_model=RealtimeToken)
async def create_token(
    body: RealtimeTokenRequest | None = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> RealtimeToken:
    try:
        data = await issue_realtime_token()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"upstream: {e}") from e

    keyterms: list[str] = []
    if body and body.series_id:
        s = await session.get(Series, body.series_id)
        if s is None or s.owner_id != user.id:
            raise HTTPException(status_code=400, detail="series_id does not exist")
        keyterms = await glossary.get_active_keyterms(
            session, body.series_id, realtime=True
        )

    return RealtimeToken(
        token=data["token"],
        expires_at=data.get("expires_at"),
        keyterms=keyterms,
    )
