from __future__ import annotations

import pytest

from app.models import Series
from app.services.series_match import suggest_series


@pytest.fixture
async def populate_series(apply_test_settings):
    async with apply_test_settings() as session:
        for name in ["Weekly 1:1 with Ali", "Q2 Planning", "Sales Sync"]:
            session.add(Series(name=name))
        await session.commit()
    return apply_test_settings


async def test_suggest_series_matches_close_title(populate_series):
    async with populate_series() as session:
        match = await suggest_series(session, "Weekly 1:1 with Aly")
        assert match is not None
        assert "Ali" in match.name
        assert match.score >= 85.0


async def test_suggest_series_returns_none_when_below_threshold(populate_series):
    async with populate_series() as session:
        match = await suggest_series(session, "Random Standalone")
        assert match is None


async def test_suggest_series_handles_empty_title(populate_series):
    async with populate_series() as session:
        assert await suggest_series(session, None) is None
        assert await suggest_series(session, "") is None
        assert await suggest_series(session, "   ") is None


async def test_suggest_series_no_existing_series(apply_test_settings):
    async with apply_test_settings() as session:
        assert await suggest_series(session, "Weekly 1:1") is None
