from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.db import get_session
from app.models import Meeting, MeetingStatus, Summary, User
from app.schemas import StatsRead

router = APIRouter()


async def _aggregate(
    session: AsyncSession, since: datetime, until: datetime, owner_id: str
) -> tuple[int, int, int, int]:
    """Return (meeting_count, total_duration_s, action_count, decision_count) in window."""
    meetings = (
        (
            await session.execute(
                select(Meeting)
                .where(
                    Meeting.owner_id == owner_id,
                    Meeting.created_at >= since,
                    Meeting.created_at < until,
                    Meeting.status == MeetingStatus.DONE,
                )
                .options(selectinload(Meeting.summaries))
            )
        )
        .scalars()
        .all()
    )

    meeting_count = 0
    total_duration = 0.0
    action_count = 0
    decision_count = 0

    for m in meetings:
        meeting_count += 1
        if m.duration_s:
            total_duration += m.duration_s
        latest: Summary | None = m.summaries[0] if m.summaries else None
        if latest is not None:
            action_count += len(latest.action_items_json or [])
            decision_count += len(latest.decisions_json or [])

    return meeting_count, int(total_duration), action_count, decision_count


@router.get("", response_model=StatsRead)
async def get_stats(
    days: int = Query(7, ge=1, le=365),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> StatsRead:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    prior_since = since - timedelta(days=days)

    cur = await _aggregate(session, since, now, user.id)
    prev = await _aggregate(session, prior_since, since, user.id)

    return StatsRead(
        days=days,
        meetings=cur[0],
        meetings_delta=cur[0] - prev[0],
        duration_s=cur[1],
        duration_delta_s=cur[1] - prev[1],
        actions=cur[2],
        decisions=cur[3],
    )
