from __future__ import annotations

import json
from typing import AsyncIterator

import httpx
import pytest

from app.services import summarizer


VALID_BRIEF = {
    "exec_summary": "خلاصه جلسه.",
    "action_items": [
        {"text": "تهیه گزارش بودجه", "owner": "علی", "due_date": "2026-05-01"},
        {"text": "ارسال ایمیل پیگیری", "owner": None, "due_date": None},
    ],
    "decisions": ["تصویب بودجه پیشنهادی."],
    "qa": [
        {"question": "تخصیص بودجه برای چه فصلی؟", "answer": "فصل دوم."},
        {"question": "زمان نسخه بعدی؟", "answer": None},
    ],
    "open_questions": [
        {"question": "تأیید نهایی بودجه با مدیر مالی.", "owner": "علی"},
    ],
    "email_draft": {
        "subject": "خلاصه جلسه بودجه",
        "body": "سلام،\n\nخلاصه جلسه ضمیمه است.\n\nبا تشکر",
    },
    "speaker_names": [
        {"speaker_id": "S1", "display_name": "علی"},
    ],
}


def _make_post_response(content_obj: dict) -> httpx.Response:
    body = {
        "id": "resp-1",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": json.dumps(content_obj)},
                "finish_reason": "stop",
            }
        ],
    }
    request = httpx.Request("POST", summarizer.OPENROUTER_URL)
    return httpx.Response(200, json=body, request=request)


async def test_summarize_returns_parsed_dict(mocker):
    response = _make_post_response(VALID_BRIEF)
    post_mock = mocker.patch(
        "httpx.AsyncClient.post",
        return_value=response,
    )

    result = await summarizer.summarize("[S1 0.00-2.50] سلام")

    assert result == VALID_BRIEF
    post_mock.assert_called_once()
    _, kwargs = post_mock.call_args
    assert kwargs["json"]["stream"] is False
    assert kwargs["json"]["response_format"]["json_schema"]["strict"] is True
    tone_msgs = [
        m for m in kwargs["json"]["messages"]
        if m["content"].startswith("Email tone:")
    ]
    assert len(tone_msgs) == 1 and "FORMAL" in tone_msgs[0]["content"]


async def test_summarize_passes_casual_tone_fragment(mocker):
    response = _make_post_response(VALID_BRIEF)
    post_mock = mocker.patch("httpx.AsyncClient.post", return_value=response)

    await summarizer.summarize("[S1 0.00-2.50] سلام", email_tone="casual")

    _, kwargs = post_mock.call_args
    tone_msg = next(
        m for m in kwargs["json"]["messages"]
        if m["content"].startswith("Email tone:")
    )
    assert "CASUAL" in tone_msg["content"]


async def test_summarize_rejects_invalid_schema(mocker):
    invalid = {k: v for k, v in VALID_BRIEF.items() if k != "exec_summary"}
    response = _make_post_response(invalid)
    mocker.patch("httpx.AsyncClient.post", return_value=response)

    with pytest.raises(ValueError):
        await summarizer.summarize("[S1 0.00-2.50] سلام")


class _StreamResponse:
    def __init__(self, lines: list[str]):
        self._lines = lines
        self.status_code = 200

    def raise_for_status(self) -> None:
        return None

    async def aiter_lines(self) -> AsyncIterator[str]:
        for line in self._lines:
            yield line


class _StreamCtx:
    def __init__(self, response: _StreamResponse):
        self._response = response

    async def __aenter__(self) -> _StreamResponse:
        return self._response

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


async def test_summarize_stream_yields_deltas_then_done(mocker):
    deltas = ["سلام ", "دنیا", "!"]
    sse_lines: list[str] = []
    sse_lines.append(": ping")
    sse_lines.append("")
    for delta in deltas:
        chunk = {
            "id": "stream-1",
            "choices": [{"index": 0, "delta": {"content": delta}}],
        }
        sse_lines.append(f"data: {json.dumps(chunk, ensure_ascii=False)}")
        sse_lines.append("")
    role_only = {
        "id": "stream-1",
        "choices": [{"index": 0, "delta": {"role": "assistant"}}],
    }
    sse_lines.insert(2, f"data: {json.dumps(role_only)}")
    sse_lines.insert(3, "")
    sse_lines.append("data: [DONE]")
    sse_lines.append("")

    def _stream(self, method, url, **kwargs):
        return _StreamCtx(_StreamResponse(sse_lines))

    mocker.patch("httpx.AsyncClient.stream", _stream)

    collected: list[str] = []
    async for piece in summarizer.summarize_stream("[S1 0.00-2.50] سلام"):
        collected.append(piece)

    assert collected[-1] == "[DONE]"
    assert "".join(collected[:-1]) == "سلام دنیا!"
