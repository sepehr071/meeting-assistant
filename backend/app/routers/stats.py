from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.db import get_session
from app.models import Meeting, MeetingStatus, Summary, User
from app.schemas import ActionItemDigest, StatsRead

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


@router.get("/action-items", response_model=list[ActionItemDigest])
async def action_items_digest(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(12, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[ActionItemDigest]:
    """Flatten action items out of the owner's recent DONE meetings into one
    digest. Sorted: dated items first (soonest/overdue due first), then undated
    by most-recent meeting. Powers the home-page action digest."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    meetings = (
        (
            await session.execute(
                select(Meeting)
                .where(
                    Meeting.owner_id == user.id,
                    Meeting.created_at >= since,
                    Meeting.status == MeetingStatus.DONE,
                )
                .order_by(Meeting.created_at.desc())
                .options(selectinload(Meeting.summaries))
            )
        )
        .scalars()
        .all()
    )

    items: list[ActionItemDigest] = []
    for m in meetings:
        latest: Summary | None = m.summaries[0] if m.summaries else None
        if latest is None:
            continue
        for ai in latest.action_items_json or []:
            text = (ai.get("text") or "").strip()
            if not text:
                continue
            owner = (ai.get("owner") or "").strip() or None
            due = (ai.get("due_date") or "").strip() or None
            items.append(
                ActionItemDigest(
                    text=text,
                    owner=owner,
                    due_date=due,
                    meeting_id=m.id,
                    meeting_title=m.title,
                    meeting_created_at=m.created_at,
                )
            )

    # Dated first (ISO strings sort chronologically → overdue/soonest first),
    # then undated by most-recent meeting.
    dated = sorted((i for i in items if i.due_date), key=lambda x: x.due_date or "")
    undated = sorted(
        (i for i in items if not i.due_date),
        key=lambda x: x.meeting_created_at,
        reverse=True,
    )
    return (dated + undated)[:limit]
