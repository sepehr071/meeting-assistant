from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import select

from app.services.transcription import TranscriptionResult


VALID_BRIEF = {
    "exec_summary": "خلاصه‌ی جلسه‌ی آزمایشی.",
    "action_items": [
        {"text": "آماده‌سازی گزارش هفتگی", "owner": "علی", "due_date": "2026-05-01"},
        {"text": "ارسال یادداشت پیگیری", "owner": None, "due_date": None},
    ],
    "decisions": ["تأیید برنامه‌ی پیشنهادی."],
}


def _make_transcription_result() -> TranscriptionResult:
    return TranscriptionResult(
        plain_text="سلام دنیا",
        words=[
            {"text": "سلام", "start": 0.0, "end": 0.5, "type": "word", "speaker_id": "speaker_0"},
            {"text": " ", "start": 0.5, "end": 0.51, "type": "spacing", "speaker_id": "speaker_0"},
            {"text": "دنیا", "start": 0.51, "end": 1.0, "type": "word", "speaker_id": "speaker_1"},
        ],
        speaker_ids=["speaker_0", "speaker_1"],
        raw={"language_code": "fas"},
        language_code="fas",
    )


async def _poll_status(client, meeting_id: str, target: str | set[str], *, attempts: int = 60, delay: float = 0.1):
    """Poll GET /api/meetings/{id} until status hits target. Returns the final body."""
    targets = {target} if isinstance(target, str) else set(target)
    last_body: dict | None = None
    for _ in range(attempts):
        resp = await client.get(f"/api/meetings/{meeting_id}")
        assert resp.status_code == 200, resp.text
        last_body = resp.json()
        if last_body["status"] in targets:
            return last_body
        await asyncio.sleep(delay)
    raise AssertionError(
        f"meeting {meeting_id} never reached status {targets}; last status="
        f"{last_body['status'] if last_body else 'unknown'} body={last_body}"
    )


def _patch_pipeline_externals(mocker, *, transcribe_side_effect=None, summarize_side_effect=None):
    """Patch external calls at the lookup site inside app.services.pipeline."""
    if transcribe_side_effect is None:
        transcribe_side_effect = _make_transcription_result()

    if callable(transcribe_side_effect) or isinstance(transcribe_side_effect, BaseException):
        transcribe_mock = mocker.patch(
            "app.services.pipeline.transcribe_async",
            side_effect=transcribe_side_effect,
        )
    else:
        transcribe_mock = mocker.patch(
            "app.services.pipeline.transcribe_async",
            return_value=transcribe_side_effect,
        )

    if summarize_side_effect is None:
        summarize_side_effect = VALID_BRIEF

    if callable(summarize_side_effect) or isinstance(summarize_side_effect, BaseException):
        summarize_mock = mocker.patch(
            "app.services.summarizer.summarize",
            side_effect=summarize_side_effect,
        )
    else:
        summarize_mock = mocker.patch(
            "app.services.summarizer.summarize",
            return_value=summarize_side_effect,
        )

    return transcribe_mock, summarize_mock


async def _upload(client, sample_webm_bytes: bytes, title: str = "جلسه‌ی آزمایشی") -> dict:
    files = {"file": ("meeting.webm", sample_webm_bytes, "audio/webm")}
    data = {"title": title}
    resp = await client.post("/api/meetings/upload", files=files, data=data)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_upload_runs_pipeline_to_done(client, sample_webm_bytes, mocker):
    _patch_pipeline_externals(mocker)

    body = await _upload(client, sample_webm_bytes)
    meeting_id = body["id"]
    assert body["status"] == "uploaded"

    final = await _poll_status(client, meeting_id, "done")
    assert final["status"] == "done"
    assert final["error_message"] is None
    assert final["language"] == "fas"

    speaker_ids = {sp["speaker_id"] for sp in final["speakers"]}
    assert speaker_ids == {"speaker_0", "speaker_1"}
    assert final["latest_summary_id"]

    transcript_resp = await client.get(f"/api/meetings/{meeting_id}/transcript")
    assert transcript_resp.status_code == 200
    transcript = transcript_resp.json()
    assert "سلام" in transcript["plain_text"]
    assert isinstance(transcript["words"], list) and transcript["words"]

    summary_resp = await client.get(f"/api/meetings/{meeting_id}/summary")
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["exec_summary"]
    assert isinstance(summary["action_items"], list) and summary["action_items"]
    assert isinstance(summary["decisions"], list)
    assert isinstance(summary["minutes"], list) and summary["minutes"]
    assert summary["model"]


async def test_upload_failure_marks_meeting_failed(client, sample_webm_bytes, mocker):
    _patch_pipeline_externals(
        mocker,
        transcribe_side_effect=RuntimeError("scribe down"),
    )

    body = await _upload(client, sample_webm_bytes)
    meeting_id = body["id"]

    final = await _poll_status(client, meeting_id, "failed")
    assert final["status"] == "failed"
    assert final["error_message"] is not None
    assert "scribe down" in final["error_message"]


async def test_speaker_rename_persists(client, sample_webm_bytes, mocker):
    _patch_pipeline_externals(mocker)

    body = await _upload(client, sample_webm_bytes)
    meeting_id = body["id"]

    await _poll_status(client, meeting_id, "done")

    rename = await client.patch(
        f"/api/meetings/{meeting_id}/speakers/speaker_0",
        json={"display_name": "علی"},
    )
    assert rename.status_code == 200, rename.text
    assert rename.json()["display_name"] == "علی"

    detail = (await client.get(f"/api/meetings/{meeting_id}")).json()
    speakers_by_id = {sp["speaker_id"]: sp for sp in detail["speakers"]}
    assert speakers_by_id["speaker_0"]["display_name"] == "علی"

    rename2 = await client.patch(
        f"/api/meetings/{meeting_id}/speakers/speaker_0",
        json={"display_name": "حسین"},
    )
    assert rename2.status_code == 200
    detail2 = (await client.get(f"/api/meetings/{meeting_id}")).json()
    speakers_by_id2 = {sp["speaker_id"]: sp for sp in detail2["speakers"]}
    assert speakers_by_id2["speaker_0"]["display_name"] == "حسین"


async def test_regenerate_creates_new_summary_row(client, sample_webm_bytes, mocker):
    transcribe_mock, summarize_mock = _patch_pipeline_externals(mocker)

    body = await _upload(client, sample_webm_bytes)
    meeting_id = body["id"]

    await _poll_status(client, meeting_id, "done")

    transcribe_calls_before = transcribe_mock.call_count
    summarize_calls_before = summarize_mock.call_count
    assert transcribe_calls_before == 1
    assert summarize_calls_before == 1

    regen = await client.post(f"/api/meetings/{meeting_id}/regenerate-summary")
    assert regen.status_code == 200, regen.text
    assert regen.json()["queued"] is True

    # Wait for the second summary row to land.
    from app.db import SessionLocal
    from app.models import Summary

    summary_count = 0
    for _ in range(60):
        async with SessionLocal() as session:
            rows = (
                await session.execute(
                    select(Summary).where(Summary.meeting_id == meeting_id)
                )
            ).scalars().all()
            summary_count = len(rows)
        if summary_count >= 2:
            break
        await asyncio.sleep(0.1)

    assert summary_count == 2, f"expected 2 summary rows, found {summary_count}"
    assert transcribe_mock.call_count == transcribe_calls_before, (
        "regenerate must not re-invoke transcription"
    )
    assert summarize_mock.call_count == summarize_calls_before + 1


async def test_cancel_endpoint_flips_status_synchronously(client, sample_webm_bytes, mocker):
    """Cancel endpoint sets status=failed + sentinel without waiting for the
    background pipeline. Pipeline integration (event signal) is best-effort
    and tested separately."""

    async def noop_pipeline(_mid: str) -> None:
        return None

    mocker.patch("app.services.pipeline.run_pipeline", side_effect=noop_pipeline)

    body = await _upload(client, sample_webm_bytes)
    mid = body["id"]

    # Pipeline is mocked, so status stays at 'uploaded'.
    detail = (await client.get(f"/api/meetings/{mid}")).json()
    assert detail["status"] == "uploaded"

    resp = await client.post(f"/api/meetings/{mid}/cancel")
    assert resp.status_code == 200, resp.text
    body2 = resp.json()
    assert body2["cancelled"] is True
    # No pipeline registered itself, so signalled is False — that's fine.
    assert body2["signalled"] is False

    detail2 = (await client.get(f"/api/meetings/{mid}")).json()
    assert detail2["status"] == "failed"
    assert detail2["error_message"] == "cancelled by user"


async def test_cancel_signals_running_pipeline(mocker, apply_test_settings):
    """Calling pipeline.request_cancel after a pipeline registers its event
    sets the event so the next _check_cancel raises."""
    from app.models import Meeting, MeetingStatus
    from app.services import pipeline

    # Seed a meeting in the test DB.
    SessionLocal = apply_test_settings
    async with SessionLocal() as session:
        meeting = Meeting(
            id="test-cancel-1",
            title="t",
            status=MeetingStatus.UPLOADED,
            original_filename="t.webm",
            audio_path="/nowhere",
        )
        session.add(meeting)
        await session.commit()

    # Manually register a cancel event (mimicking a running pipeline).
    ev = asyncio.Event()
    pipeline._cancel_events["test-cancel-1"] = ev

    try:
        signalled = await pipeline.request_cancel("test-cancel-1")
        assert signalled is True
        assert ev.is_set()
    finally:
        pipeline._cancel_events.pop("test-cancel-1", None)

    # Unknown id returns False.
    assert (await pipeline.request_cancel("does-not-exist")) is False


async def test_cancel_rejected_when_done(client, sample_webm_bytes, mocker):
    _patch_pipeline_externals(mocker)
    body = await _upload(client, sample_webm_bytes)
    mid = body["id"]
    await _poll_status(client, mid, "done")
    resp = await client.post(f"/api/meetings/{mid}/cancel")
    assert resp.status_code == 400


async def test_oversize_upload_rejected(client, sample_webm_bytes, mocker):
    """Patch the size limit constant to a tiny value, then upload bytes above it."""
    from app.routers import meetings as meetings_router

    monkeypatch_value = 1024  # 1 KB
    mocker.patch.object(meetings_router, "MAX_UPLOAD_BYTES", monkeypatch_value)

    # sample_webm_bytes is ~1600 bytes (16 * 100), well above 1 KB.
    big_bytes = sample_webm_bytes * 2  # ~3200 bytes
    assert len(big_bytes) > monkeypatch_value

    files = {"file": ("big.webm", big_bytes, "audio/webm")}
    data = {"title": "بزرگ"}
    resp = await client.post("/api/meetings/upload", files=files, data=data)

    assert resp.status_code == 400, resp.text
    assert "exceeds max size" in resp.json()["detail"]
