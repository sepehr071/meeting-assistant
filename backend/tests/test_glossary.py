from __future__ import annotations

import pytest

from app.models import KeytermSource, Series, SeriesKeyterm
from app.services import glossary


@pytest.fixture
async def series(apply_test_settings):
    async with apply_test_settings() as session:
        s = Series(name="Weekly 1:1")
        session.add(s)
        await session.commit()
        await session.refresh(s)
        return s


async def test_add_manual_term_inserts_and_dedups(apply_test_settings, series):
    async with apply_test_settings() as session:
        row = await glossary.add_manual_term(session, series.id, "نوین")
        assert row is not None
        assert row.source == KeytermSource.MANUAL

        again = await glossary.add_manual_term(session, series.id, "نوین")
        assert again is not None and again.id == row.id


async def test_add_manual_term_promotes_suggested(apply_test_settings, series):
    async with apply_test_settings() as session:
        await glossary.add_suggested_terms(session, series.id, ["MeetGPT"])

        promoted = await glossary.add_manual_term(session, series.id, "MeetGPT")
        assert promoted is not None
        assert promoted.source == KeytermSource.MANUAL


async def test_add_suggested_terms_filters_invalid(apply_test_settings, series):
    async with apply_test_settings() as session:
        added = await glossary.add_suggested_terms(
            session,
            series.id,
            [
                "Ali",
                "x",  # too short
                "12345",  # digits only
                "this is way more than five words to count here",  # >5 words
                "A" * 60,  # >50 chars
                "Ali",  # duplicate
            ],
        )
        assert added == 1


async def test_get_active_keyterms_returns_manual_and_accepted_only(
    apply_test_settings, series
):
    async with apply_test_settings() as session:
        await glossary.add_manual_term(session, series.id, "Alpha")
        await glossary.add_suggested_terms(session, series.id, ["Beta", "Gamma"])

        terms = await glossary.get_active_keyterms(session, series.id)
        assert terms == ["Alpha"]

        suggested = (
            await session.execute(
                __import__("sqlalchemy")
                .select(SeriesKeyterm)
                .where(SeriesKeyterm.term == "Beta")
            )
        ).scalar_one()
        await glossary.accept_term(session, suggested.id)

        terms = await glossary.get_active_keyterms(session, series.id)
        assert set(terms) == {"Alpha", "Beta"}


async def test_get_active_keyterms_realtime_caps_chars(apply_test_settings, series):
    async with apply_test_settings() as session:
        await glossary.add_manual_term(session, series.id, "short")
        await glossary.add_manual_term(session, series.id, "twenty-one-chars-x")
        await glossary.add_manual_term(session, series.id, "this is over twenty chars")

        rt = await glossary.get_active_keyterms(session, series.id, realtime=True)
        assert "short" in rt
        for term in rt:
            assert len(term) <= 20


async def test_reject_term_deletes_row(apply_test_settings, series):
    async with apply_test_settings() as session:
        await glossary.add_suggested_terms(session, series.id, ["DropMe"])
        row = (
            await session.execute(
                __import__("sqlalchemy")
                .select(SeriesKeyterm)
                .where(SeriesKeyterm.term == "DropMe")
            )
        ).scalar_one()
        ok = await glossary.reject_term(session, row.id)
        assert ok is True
        assert (await session.get(SeriesKeyterm, row.id)) is None


def test_extract_correction_diffs_returns_only_new_tokens():
    diffs = glossary.extract_correction_diffs(
        old_text="Speaker said hello world",
        new_text="Speaker said hello GammaCorp world",
    )
    assert diffs == ["GammaCorp"]


def test_extract_correction_diffs_filters_invalid_tokens():
    diffs = glossary.extract_correction_diffs(
        old_text="",
        new_text="x 1234 ValidName",
    )
    assert diffs == ["ValidName"]


async def test_upsert_speaker_name_upserts_and_lists(apply_test_settings, series):
    async with apply_test_settings() as session:
        await glossary.upsert_speaker_name(session, series.id, "Ali")
        await glossary.upsert_speaker_name(session, series.id, "Sara")
        await glossary.upsert_speaker_name(session, series.id, "Ali")

        names = await glossary.list_speaker_names(session, series.id)
        assert set(names) == {"Ali", "Sara"}
        assert names[0] == "Ali"
