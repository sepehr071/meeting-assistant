from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KeytermSource, SeriesKeyterm, SeriesSpeakerName

BATCH_MAX_TERMS = 1000
BATCH_MAX_CHARS = 50
REALTIME_MAX_TERMS = 50
REALTIME_MAX_CHARS = 20
KEYTERM_MAX_WORDS = 5


_TOKEN_PUNCT = re.compile(r"[\s،.,;:!?\(\)\[\]\{\}\"'«»\-_/\\|]+")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_valid_keyterm(term: str, *, max_chars: int) -> bool:
    if not term:
        return False
    term = term.strip()
    if len(term) < 2 or len(term) > max_chars:
        return False
    word_count = len([w for w in _TOKEN_PUNCT.split(term) if w])
    if word_count > KEYTERM_MAX_WORDS:
        return False
    if term.isdigit():
        return False
    return True


async def get_active_keyterms(
    session: AsyncSession,
    series_id: str,
    *,
    realtime: bool = False,
) -> list[str]:
    max_terms = REALTIME_MAX_TERMS if realtime else BATCH_MAX_TERMS
    max_chars = REALTIME_MAX_CHARS if realtime else BATCH_MAX_CHARS
    stmt = (
        select(SeriesKeyterm.term)
        .where(SeriesKeyterm.series_id == series_id)
        .where(SeriesKeyterm.source.in_([KeytermSource.MANUAL, KeytermSource.ACCEPTED]))
        .order_by(SeriesKeyterm.created_at.asc())
    )
    rows = (await session.execute(stmt)).scalars().all()
    out: list[str] = []
    seen: set[str] = set()
    for term in rows:
        clean = term.strip()
        if clean in seen:
            continue
        if not _is_valid_keyterm(clean, max_chars=max_chars):
            continue
        seen.add(clean)
        out.append(clean)
        if len(out) >= max_terms:
            break
    return out


async def add_suggested_terms(
    session: AsyncSession, series_id: str, terms: list[str]
) -> int:
    added = 0
    for raw in terms:
        if not raw:
            continue
        term = raw.strip()
        if not _is_valid_keyterm(term, max_chars=BATCH_MAX_CHARS):
            continue
        stmt = (
            sqlite_insert(SeriesKeyterm)
            .values(
                series_id=series_id,
                term=term,
                source=KeytermSource.SUGGESTED,
            )
            .on_conflict_do_nothing(index_elements=["series_id", "term"])
        )
        result = await session.execute(stmt)
        if result.rowcount:
            added += 1
    if added:
        await session.commit()
    return added


async def add_manual_term(
    session: AsyncSession, series_id: str, term: str
) -> SeriesKeyterm | None:
    term = term.strip()
    if not _is_valid_keyterm(term, max_chars=BATCH_MAX_CHARS):
        return None
    existing = (
        await session.execute(
            select(SeriesKeyterm)
            .where(SeriesKeyterm.series_id == series_id)
            .where(SeriesKeyterm.term == term)
        )
    ).scalar_one_or_none()
    if existing is not None:
        if existing.source != KeytermSource.MANUAL:
            existing.source = KeytermSource.MANUAL
            await session.commit()
        return existing
    row = SeriesKeyterm(series_id=series_id, term=term, source=KeytermSource.MANUAL)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def accept_term(session: AsyncSession, term_id: str) -> bool:
    result = await session.execute(
        update(SeriesKeyterm)
        .where(SeriesKeyterm.id == term_id)
        .values(source=KeytermSource.ACCEPTED)
    )
    if result.rowcount:
        await session.commit()
        return True
    return False


async def reject_term(session: AsyncSession, term_id: str) -> bool:
    row = await session.get(SeriesKeyterm, term_id)
    if row is None:
        return False
    await session.delete(row)
    await session.commit()
    return True


def extract_correction_diffs(old_text: str | None, new_text: str | None) -> list[str]:
    if not new_text:
        return []
    new_tokens = [t for t in _TOKEN_PUNCT.split(new_text) if t]
    if not old_tokens_present(old_text):
        return _filter_tokens(new_tokens)
    old_set = set(t for t in _TOKEN_PUNCT.split(old_text or "") if t)
    fresh = [t for t in new_tokens if t not in old_set]
    return _filter_tokens(fresh)


def old_tokens_present(text: str | None) -> bool:
    return bool(text and text.strip())


def _filter_tokens(tokens: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for tok in tokens:
        clean = tok.strip()
        if clean in seen:
            continue
        if not _is_valid_keyterm(clean, max_chars=BATCH_MAX_CHARS):
            continue
        seen.add(clean)
        out.append(clean)
    return out


async def upsert_speaker_name(
    session: AsyncSession, series_id: str, display_name: str
) -> None:
    name = display_name.strip()
    if not name:
        return
    stmt = (
        sqlite_insert(SeriesSpeakerName)
        .values(series_id=series_id, display_name=name, last_used_at=_now())
        .on_conflict_do_update(
            index_elements=["series_id", "display_name"],
            set_={"last_used_at": _now()},
        )
    )
    await session.execute(stmt)
    await session.commit()


async def list_speaker_names(session: AsyncSession, series_id: str) -> list[str]:
    stmt = (
        select(SeriesSpeakerName.display_name)
        .where(SeriesSpeakerName.series_id == series_id)
        .order_by(SeriesSpeakerName.last_used_at.desc())
    )
    return list((await session.execute(stmt)).scalars().all())
