from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import KeytermSource, Meeting, Series, SeriesKeyterm
from app.schemas import (
    KeyTermCreate,
    KeyTermRead,
    SeriesCreate,
    SeriesRead,
    SeriesUpdate,
    SeriesWithCount,
)
from app.services import glossary

router = APIRouter()


@router.get("", response_model=list[SeriesWithCount])
async def list_series(session: AsyncSession = Depends(get_session)) -> list[SeriesWithCount]:
    rows = (
        await session.execute(
            select(Series, func.count(Meeting.id))
            .outerjoin(Meeting, Meeting.series_id == Series.id)
            .group_by(Series.id)
            .order_by(Series.name.asc())
        )
    ).all()
    return [
        SeriesWithCount(
            id=s.id,
            name=s.name,
            email_tone=s.email_tone,
            created_at=s.created_at,
            updated_at=s.updated_at,
            meeting_count=count,
        )
        for s, count in rows
    ]


@router.post("", response_model=SeriesRead, status_code=status.HTTP_201_CREATED)
async def create_series(
    body: SeriesCreate, session: AsyncSession = Depends(get_session)
) -> SeriesRead:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    existing = (
        await session.execute(select(Series).where(Series.name == name))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="series with this name exists")
    s = Series(name=name, email_tone=body.email_tone)
    session.add(s)
    await session.commit()
    await session.refresh(s)
    return SeriesRead.model_validate(s)


@router.patch("/{series_id}", response_model=SeriesRead)
async def update_series(
    series_id: str,
    body: SeriesUpdate,
    session: AsyncSession = Depends(get_session),
) -> SeriesRead:
    s = await session.get(Series, series_id)
    if s is None:
        raise HTTPException(status_code=404, detail="series not found")
    if body.name is not None:
        new_name = body.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        s.name = new_name
    if body.email_tone is not None:
        s.email_tone = body.email_tone
    await session.commit()
    await session.refresh(s)
    return SeriesRead.model_validate(s)


@router.delete("/{series_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_series(
    series_id: str, session: AsyncSession = Depends(get_session)
) -> None:
    s = await session.get(Series, series_id)
    if s is None:
        raise HTTPException(status_code=404, detail="series not found")
    await session.delete(s)
    await session.commit()


@router.get("/{series_id}/keyterms", response_model=list[KeyTermRead])
async def list_keyterms(
    series_id: str,
    source: KeytermSource | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> list[KeyTermRead]:
    s = await session.get(Series, series_id)
    if s is None:
        raise HTTPException(status_code=404, detail="series not found")
    stmt = (
        select(SeriesKeyterm)
        .where(SeriesKeyterm.series_id == series_id)
        .order_by(SeriesKeyterm.created_at.desc())
    )
    if source is not None:
        stmt = stmt.where(SeriesKeyterm.source == source)
    rows = (await session.execute(stmt)).scalars().all()
    return [KeyTermRead.model_validate(r) for r in rows]


@router.post(
    "/{series_id}/keyterms",
    response_model=KeyTermRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_keyterm(
    series_id: str,
    body: KeyTermCreate,
    session: AsyncSession = Depends(get_session),
) -> KeyTermRead:
    s = await session.get(Series, series_id)
    if s is None:
        raise HTTPException(status_code=404, detail="series not found")
    row = await glossary.add_manual_term(session, series_id, body.term)
    if row is None:
        raise HTTPException(
            status_code=400, detail="invalid term (length, word count, or empty)"
        )
    return KeyTermRead.model_validate(row)


@router.post("/{series_id}/keyterms/{term_id}/accept", response_model=KeyTermRead)
async def accept_keyterm(
    series_id: str,
    term_id: str,
    session: AsyncSession = Depends(get_session),
) -> KeyTermRead:
    row = await session.get(SeriesKeyterm, term_id)
    if row is None or row.series_id != series_id:
        raise HTTPException(status_code=404, detail="keyterm not found")
    ok = await glossary.accept_term(session, term_id)
    if not ok:
        raise HTTPException(status_code=404, detail="keyterm not found")
    await session.refresh(row)
    return KeyTermRead.model_validate(row)


@router.delete(
    "/{series_id}/keyterms/{term_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def reject_keyterm(
    series_id: str,
    term_id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    row = await session.get(SeriesKeyterm, term_id)
    if row is None or row.series_id != series_id:
        raise HTTPException(status_code=404, detail="keyterm not found")
    await glossary.reject_term(session, term_id)


@router.get("/{series_id}/speaker-names", response_model=list[str])
async def list_speaker_names(
    series_id: str, session: AsyncSession = Depends(get_session)
) -> list[str]:
    s = await session.get(Series, series_id)
    if s is None:
        raise HTTPException(status_code=404, detail="series not found")
    return await glossary.list_speaker_names(session, series_id)
