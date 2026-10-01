from __future__ import annotations

import asyncio
from typing import AsyncIterator

import pytest
from sqlalchemy import select

from tests.test_pipeline_e2e import _patch_pipeline_externals, _poll_status, _upload


async def _create_done_meeting(client, sample_webm_bytes: bytes, mocker) -> str:
    """Upload a meeting, drive it to done via mocked pipeline, return meeting_id."""
    _patch_pipeline_externals(mocker)
    body = await _upload(client, sample_webm_bytes)
    mid = body["id"]
    await _poll_status(client, mid, "done")
    return mid


@pytest.mark.asyncio
async def test_chat_history_empty(client, sample_webm_bytes, mocker):
    """GET /chat/messages on a fresh meeting returns []."""
    mid = await _create_done_meeting(client, sample_webm_bytes, mocker)
    resp = await client.get(f"/api/meetings/{mid}/chat/messages")
    assert resp.status_code == 200, resp.text
    assert resp.json() == []


@pytest.mark.asyncio
async def test_chat_ask_persists_user_and_assistant_messages(
    client, sample_webm_bytes, mocker, apply_test_settings
):
    """POST /chat/ask streams deltas and persists both user and assistant rows."""

    async def _fake_stream(
        meeting_context: str, history: list[dict], user_message: str
    ) -> AsyncIterator[str]:
        yield "پاسخ "
        yield "آزمایشی"

    mocker.patch(
        "app.services.chat.chat_stream",
        side_effect=_fake_stream,
    )

    mid = await _create_done_meeting(client, sample_webm_bytes, mocker)

    resp = await client.post(
        f"/api/meetings/{mid}/chat/ask",
        json={"message": "چه تصمیماتی گرفته شد؟"},
    )
    assert resp.status_code == 200, resp.text

    # Drain the SSE stream.
    content = resp.content.decode("utf-8")
    lines = [l.strip() for l in content.splitlines() if l.startswith("data:")]
    assert len(lines) >= 2, f"expected at least 2 SSE lines; got: {lines}"

    # Last line should be the "done" event.
    last = lines[-1]
    assert '"type": "done"' in last or '"type":"done"' in last, f"expected done event; got {last}"

    # History should now have 2 rows.
    hist_resp = await client.get(f"/api/meetings/{mid}/chat/messages")
    assert hist_resp.status_code == 200
    msgs = hist_resp.json()
    assert len(msgs) == 2, f"expected 2 messages; got {len(msgs)}: {msgs}"
    assert msgs[0]["role"] == "user"
    assert msgs[0]["content"] == "چه تصمیماتی گرفته شد؟"
    assert msgs[1]["role"] == "assistant"
    assert msgs[1]["content"] == "پاسخ آزمایشی"
    # Timestamps must be ordered.
    assert msgs[0]["created_at"] <= msgs[1]["created_at"]


@pytest.mark.asyncio
async def test_chat_ask_409_when_summary_missing(client, sample_webm_bytes, mocker):
    """POST /chat/ask returns 409 when meeting has not been fully processed."""

    async def noop_pipeline(_mid: str) -> None:
        return None

    mocker.patch("app.services.pipeline.run_pipeline", side_effect=noop_pipeline)

    files = {"file": ("m.webm", sample_webm_bytes, "audio/webm")}
    data = {"title": "جلسه‌ی ناقص"}
    resp = await client.post("/api/meetings/upload", files=files, data=data)
    assert resp.status_code == 201
    mid = resp.json()["id"]

    # Status is "uploaded" (pipeline is a no-op), so the 409 guard fires.
    ask = await client.post(
        f"/api/meetings/{mid}/chat/ask",
        json={"message": "سوال"},
    )
    assert ask.status_code == 409, ask.text


@pytest.mark.asyncio
async def test_chat_clear_history(client, sample_webm_bytes, mocker):
    """DELETE /chat/messages wipes all rows for that meeting."""

    async def _fake_stream(
        meeting_context: str, history: list[dict], user_message: str
    ) -> AsyncIterator[str]:
        yield "خوب"

    mocker.patch(
        "app.services.chat.chat_stream",
        side_effect=_fake_stream,
    )

    mid = await _create_done_meeting(client, sample_webm_bytes, mocker)

    # Insert a message via ask.
    await client.post(
        f"/api/meetings/{mid}/chat/ask",
        json={"message": "سلام"},
    )

    # Verify rows exist.
    hist = (await client.get(f"/api/meetings/{mid}/chat/messages")).json()
    assert len(hist) == 2, f"expected 2 messages after ask; got {len(hist)}"

    # Delete.
    del_resp = await client.delete(f"/api/meetings/{mid}/chat/messages")
    assert del_resp.status_code == 204, del_resp.text

    # Now empty.
    hist2 = (await client.get(f"/api/meetings/{mid}/chat/messages")).json()
    assert hist2 == []
