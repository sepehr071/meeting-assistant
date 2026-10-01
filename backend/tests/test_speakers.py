from __future__ import annotations

from sqlalchemy import select

from app.models import (
    EmailTone,
    KeytermSource,
    Meeting,
    MeetingStatus,
    Series,
    SeriesKeyterm,
    SeriesSpeakerName,
    Speaker,
)
from app.services import speakers


async def _seed_meeting(SessionLocal, *, series_id: str | None = None) -> str:
    async with SessionLocal() as s:
        m = Meeting(
            id="m-test-1",
            title="t",
            status=MeetingStatus.SUMMARIZING,
            original_filename="t.webm",
            audio_path="/nowhere",
            series_id=series_id,
        )
        s.add(m)
        s.add(Speaker(meeting_id="m-test-1", speaker_id="speaker_0", display_name=None))
        s.add(Speaker(meeting_id="m-test-1", speaker_id="speaker_1", display_name=None))
        await s.commit()
    return "m-test-1"


async def _seed_series(SessionLocal) -> str:
    async with SessionLocal() as s:
        sr = Series(id="series-1", name="Standup", email_tone=EmailTone.FORMAL)
        s.add(sr)
        await s.commit()
    return "series-1"


async def test_apply_speaker_names_sets_display_name(apply_test_settings):
    SessionLocal = apply_test_settings
    mid = await _seed_meeting(SessionLocal)

    async with SessionLocal() as s:
        meeting = await s.get(Meeting, mid)
        n = await speakers.apply_speaker_names(
            s,
            meeting,
            [
                {"speaker_id": "speaker_0", "display_name": "Ali"},
                {"speaker_id": "speaker_1", "display_name": "Hossein"},
            ],
        )
    assert n == 2

    async with SessionLocal() as s:
        rows = (await s.execute(select(Speaker).where(Speaker.meeting_id == mid))).scalars().all()
        by_id = {r.speaker_id: r.display_name for r in rows}
        assert by_id == {"speaker_0": "Ali", "speaker_1": "Hossein"}


async def test_apply_speaker_names_skips_already_named(apply_test_settings):
    """Manual edits must always win over LLM re-runs."""
    SessionLocal = apply_test_settings
    mid = await _seed_meeting(SessionLocal)

    async with SessionLocal() as s:
        sp = await s.get(Speaker, {"meeting_id": mid, "speaker_id": "speaker_0"})
        sp.display_name = "ManuallySet"
        await s.commit()

    async with SessionLocal() as s:
        meeting = await s.get(Meeting, mid)
        n = await speakers.apply_speaker_names(
            s,
            meeting,
            [
                {"speaker_id": "speaker_0", "display_name": "LLMTriedToOverride"},
                {"speaker_id": "speaker_1", "display_name": "Hossein"},
            ],
        )
    assert n == 1  # only speaker_1 got assigned

    async with SessionLocal() as s:
        sp0 = await s.get(Speaker, {"meeting_id": mid, "speaker_id": "speaker_0"})
        sp1 = await s.get(Speaker, {"meeting_id": mid, "speaker_id": "speaker_1"})
        assert sp0.display_name == "ManuallySet"
        assert sp1.display_name == "Hossein"


async def test_apply_speaker_names_skips_blanks_and_invalid_entries(apply_test_settings):
    SessionLocal = apply_test_settings
    mid = await _seed_meeting(SessionLocal)

    async with SessionLocal() as s:
        meeting = await s.get(Meeting, mid)
        mapping: list = [
            {"speaker_id": "speaker_0", "display_name": "   "},  # blank name
            {"speaker_id": "  ", "display_name": "Ali"},          # blank id
            {"speaker_id": "speaker_1"},                          # missing name
            {"display_name": "Ali"},                              # missing id
            "not a dict",                                         # wrong type
            {"speaker_id": "speaker_1", "display_name": "Hossein"},  # valid
        ]
        n = await speakers.apply_speaker_names(s, meeting, mapping)
    assert n == 1

    async with SessionLocal() as s:
        sp0 = await s.get(Speaker, {"meeting_id": mid, "speaker_id": "speaker_0"})
        sp1 = await s.get(Speaker, {"meeting_id": mid, "speaker_id": "speaker_1"})
        assert sp0.display_name is None
        assert sp1.display_name == "Hossein"


async def test_apply_speaker_names_skips_unknown_speaker_id(apply_test_settings):
    SessionLocal = apply_test_settings
    mid = await _seed_meeting(SessionLocal)

    async with SessionLocal() as s:
        meeting = await s.get(Meeting, mid)
        n = await speakers.apply_speaker_names(
            s,
            meeting,
            [{"speaker_id": "speaker_99", "display_name": "Ghost"}],
        )
    assert n == 0


async def test_apply_speaker_names_empty_mapping(apply_test_settings):
    SessionLocal = apply_test_settings
    mid = await _seed_meeting(SessionLocal)
    async with SessionLocal() as s:
        meeting = await s.get(Meeting, mid)
        assert await speakers.apply_speaker_names(s, meeting, []) == 0
        assert await speakers.apply_speaker_names(s, meeting, None) == 0  # type: ignore[arg-type]


async def test_apply_speaker_names_syncs_to_series_glossary(apply_test_settings):
    """Auto-assigned names land in series_speaker_names + suggested keyterms."""
    SessionLocal = apply_test_settings
    sid = await _seed_series(SessionLocal)
    mid = await _seed_meeting(SessionLocal, series_id=sid)

    async with SessionLocal() as s:
        meeting = await s.get(Meeting, mid)
        n = await speakers.apply_speaker_names(
            s,
            meeting,
            [
                {"speaker_id": "speaker_0", "display_name": "Ali"},
                {"speaker_id": "speaker_1", "display_name": "Hossein"},
            ],
        )
    assert n == 2

    async with SessionLocal() as s:
        names = (
            await s.execute(select(SeriesSpeakerName.display_name).where(SeriesSpeakerName.series_id == sid))
        ).scalars().all()
        assert set(names) == {"Ali", "Hossein"}

        suggested = (
            await s.execute(
                select(SeriesKeyterm.term).where(
                    SeriesKeyterm.series_id == sid,
                    SeriesKeyterm.source == KeytermSource.SUGGESTED,
                )
            )
        ).scalars().all()
        assert set(suggested) == {"Ali", "Hossein"}


async def test_apply_speaker_names_no_series_no_glossary_sync(apply_test_settings):
    """Standalone meetings: no series → no glossary writes."""
    SessionLocal = apply_test_settings
    mid = await _seed_meeting(SessionLocal, series_id=None)

    async with SessionLocal() as s:
        meeting = await s.get(Meeting, mid)
        n = await speakers.apply_speaker_names(
            s,
            meeting,
            [{"speaker_id": "speaker_0", "display_name": "Ali"}],
        )
    assert n == 1

    async with SessionLocal() as s:
        names = (await s.execute(select(SeriesSpeakerName))).scalars().all()
        terms = (await s.execute(select(SeriesKeyterm))).scalars().all()
        assert names == []
        assert terms == []
