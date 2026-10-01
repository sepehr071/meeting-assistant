from __future__ import annotations

from typing import Iterable

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Meeting, Speaker
from app.services import glossary


async def apply_speaker_names(
    session: AsyncSession,
    meeting: Meeting,
    mapping: Iterable[dict],
) -> int:
    """Set Speaker.display_name from an LLM-inferred mapping.

    Each entry is `{"speaker_id": str, "display_name": str}`. Skips entries
    with blank fields or speakers that already have a non-empty display_name
    (preserves manual edits). Mirrors the series-glossary sync done in
    routers.meetings.rename_speaker so auto-assigned names land in the
    series speaker-name memory + suggested keyterms.

    Returns the count of speakers whose display_name was set.
    """
    applied: list[str] = []
    for entry in mapping or []:
        if not isinstance(entry, dict):
            continue
        sid_raw = entry.get("speaker_id")
        name_raw = entry.get("display_name")
        if sid_raw is None or name_raw is None:
            continue
        sid = str(sid_raw).strip()
        name = str(name_raw).strip()
        if not sid or not name:
            continue

        speaker = await session.get(
            Speaker,
            {"meeting_id": meeting.id, "speaker_id": sid},
        )
        if speaker is None:
            continue
        if speaker.display_name and speaker.display_name.strip():
            continue
        speaker.display_name = name
        applied.append(name)

    if not applied:
        return 0

    await session.commit()

    if meeting.series_id:
        for name in applied:
            await glossary.upsert_speaker_name(session, meeting.series_id, name)
        await glossary.add_suggested_terms(session, meeting.series_id, applied)

    return len(applied)
