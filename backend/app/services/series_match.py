from __future__ import annotations

from dataclasses import dataclass

from rapidfuzz import fuzz, process
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Series

DEFAULT_THRESHOLD = 85.0


@dataclass
class SeriesSuggestion:
    series_id: str
    name: str
    score: float


async def suggest_series(
    session: AsyncSession,
    title: str | None,
    *,
    threshold: float = DEFAULT_THRESHOLD,
) -> SeriesSuggestion | None:
    if not title or not title.strip():
        return None
    rows = (await session.execute(select(Series.id, Series.name))).all()
    if not rows:
        return None
    name_to_id = {name: sid for sid, name in rows}
    match = process.extractOne(
        title.strip(),
        list(name_to_id.keys()),
        scorer=fuzz.token_sort_ratio,
        score_cutoff=threshold,
    )
    if match is None:
        return None
    name, score, _ = match
    return SeriesSuggestion(series_id=name_to_id[name], name=name, score=float(score))
