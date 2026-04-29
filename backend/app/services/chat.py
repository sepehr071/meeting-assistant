from __future__ import annotations

import json
from typing import AsyncIterator

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Meeting, Summary, Transcript
from app.services.pipeline import build_diarized_prompt
from app.services.summarizer import OPENROUTER_URL, _headers

SYSTEM_PROMPT = """You are an assistant for a recorded Persian meeting.
Answer the user's questions using ONLY the provided meeting transcript and summary artifacts.
Reply in Persian. Be concise. If the answer is not in the meeting, say so clearly."""


async def build_meeting_context(session: AsyncSession, meeting_id: str) -> str:
    """Build a system-context string with the meeting's transcript and all summary artifacts."""
    meeting = await session.get(Meeting, meeting_id)
    if meeting is None:
        raise RuntimeError(f"build_meeting_context: meeting {meeting_id} not found")

    transcript = await session.get(Transcript, meeting_id)

    summary_row = (
        await session.execute(
            select(Summary)
            .where(Summary.meeting_id == meeting_id)
            .order_by(Summary.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    parts: list[str] = []

    # --- meeting metadata ---
    parts.append("## Meeting metadata")
    parts.append(f"title: {meeting.title or '(بدون عنوان)'}")
    parts.append(f"date: {meeting.created_at.isoformat()}")
    if meeting.meeting_brief:
        parts.append(f"brief: {meeting.meeting_brief}")

    # --- diarized transcript ---
    if transcript is not None:
        words: list[dict] = list(transcript.words_json or [])
        if words:
            parts.append("\n## Diarized transcript")
            parts.append(build_diarized_prompt(words))

    # --- summary artifacts ---
    if summary_row is not None:
        parts.append("\n## Summary artifacts")
        parts.append(f"exec_summary: {summary_row.exec_summary}")

        if summary_row.action_items_json:
            parts.append("\naction_items:")
            parts.append(json.dumps(summary_row.action_items_json, ensure_ascii=False))

        if summary_row.decisions_json:
            parts.append("\ndecisions:")
            parts.append(json.dumps(summary_row.decisions_json, ensure_ascii=False))

        if summary_row.qa_json:
            parts.append("\nqa:")
            parts.append(json.dumps(summary_row.qa_json, ensure_ascii=False))

        if summary_row.open_questions_json:
            parts.append("\nopen_questions:")
            parts.append(json.dumps(summary_row.open_questions_json, ensure_ascii=False))

        if summary_row.email_subject or summary_row.email_draft:
            parts.append("\nemail_draft:")
            parts.append(
                json.dumps(
                    {
                        "subject": summary_row.email_subject,
                        "body": summary_row.email_draft,
                        "tone": summary_row.email_tone,
                    },
                    ensure_ascii=False,
                )
            )

        if summary_row.minutes_json:
            parts.append("\nminutes:")
            parts.append(json.dumps(summary_row.minutes_json, ensure_ascii=False))

    return "\n".join(parts)


async def chat_stream(
    meeting_context: str,
    history: list[dict],
    user_message: str,
) -> AsyncIterator[str]:
    """Stream LLM reply deltas for a chat turn.

    Yields text chunks as they arrive. Does NOT yield a terminal sentinel —
    callers detect completion when the async iterator is exhausted.
    """
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": meeting_context},
        *history,
        {"role": "user", "content": user_message},
    ]
    body = {
        "model": settings.OPENROUTER_MODEL,
        "messages": messages,
        "temperature": 0.3,
        "reasoning": {"effort": "minimal", "exclude": True},
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            OPENROUTER_URL,
            headers=_headers(),
            json=body,
        ) as response:
            response.raise_for_status()
            async for raw_line in response.aiter_lines():
                if not raw_line:
                    continue
                if raw_line.startswith(":"):
                    continue
                if not raw_line.startswith("data:"):
                    continue
                payload = raw_line[len("data:"):].strip()
                if not payload:
                    continue
                if payload == "[DONE]":
                    break
                try:
                    chunk = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                choices = chunk.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                content = delta.get("content")
                if content:
                    yield content
