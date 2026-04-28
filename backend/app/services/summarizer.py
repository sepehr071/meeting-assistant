from __future__ import annotations

import json
from pathlib import Path
from typing import AsyncIterator

import httpx
from jsonschema import ValidationError, validate

from app.config import settings

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

JSON_SCHEMA: dict = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "exec_summary",
        "action_items",
        "decisions",
        "minutes",
        "qa",
        "open_questions",
        "email_draft",
    ],
    "properties": {
        "exec_summary": {"type": "string"},
        "action_items": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["text", "owner", "due_date"],
                "properties": {
                    "text": {"type": "string"},
                    "owner": {"type": ["string", "null"]},
                    "due_date": {"type": ["string", "null"]},
                },
            },
        },
        "decisions": {"type": "array", "items": {"type": "string"}},
        "minutes": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["speaker_id", "text", "start_s", "end_s"],
                "properties": {
                    "speaker_id": {"type": "string"},
                    "text": {"type": "string"},
                    "start_s": {"type": "number"},
                    "end_s": {"type": "number"},
                },
            },
        },
        "qa": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["question", "answer"],
                "properties": {
                    "question": {"type": "string"},
                    "answer": {"type": ["string", "null"]},
                },
            },
        },
        "open_questions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["question", "owner"],
                "properties": {
                    "question": {"type": "string"},
                    "owner": {"type": ["string", "null"]},
                },
            },
        },
        "email_draft": {
            "type": "object",
            "additionalProperties": False,
            "required": ["subject", "body"],
            "properties": {
                "subject": {"type": "string"},
                "body": {"type": "string"},
            },
        },
    },
}

EMAIL_TONE_FORMAL = "formal"
EMAIL_TONE_CASUAL = "casual"
_VALID_TONES = {EMAIL_TONE_FORMAL, EMAIL_TONE_CASUAL}

_TONE_FRAGMENTS = {
    EMAIL_TONE_FORMAL: (
        "Email tone: FORMAL. Use respectful Persian (احتراماً، با تشکر، خواهشمندیم). "
        "Address attendees collectively. Keep the body 4-8 short paragraphs."
    ),
    EMAIL_TONE_CASUAL: (
        "Email tone: CASUAL. Use friendly conversational Persian (سلام، ممنون، می‌بینمتون). "
        "Drop honorifics. Short and to-the-point. 3-6 short paragraphs."
    ),
}

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "summary_system.txt"
SYSTEM_PROMPT_TEXT = _PROMPT_PATH.read_text(encoding="utf-8")


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "HTTP-Referer": settings.OPENROUTER_REFERER,
        "X-Title": settings.OPENROUTER_TITLE,
        "Content-Type": "application/json",
    }


def _build_messages(
    diarized_prompt: str,
    context: str | None,
    email_tone: str,
) -> list[dict]:
    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT_TEXT}]
    tone = email_tone if email_tone in _VALID_TONES else EMAIL_TONE_FORMAL
    messages.append({"role": "system", "content": _TONE_FRAGMENTS[tone]})
    if context and context.strip():
        messages.append(
            {
                "role": "system",
                "content": (
                    "## Meeting context (provided by user)\n"
                    "Use this to disambiguate names, products, and acronyms when "
                    "transcribing into action items / decisions / minutes. Map "
                    "speaker_ids to attendee names listed here when the speaker "
                    "introduces themselves or is addressed by name in the transcript.\n\n"
                    + context.strip()
                ),
            }
        )
    messages.append({"role": "user", "content": diarized_prompt})
    return messages


def _body(
    diarized_prompt: str,
    *,
    stream: bool,
    context: str | None = None,
    email_tone: str = EMAIL_TONE_FORMAL,
) -> dict:
    return {
        "model": settings.OPENROUTER_MODEL,
        "messages": _build_messages(diarized_prompt, context, email_tone),
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "meeting_brief",
                "strict": True,
                "schema": JSON_SCHEMA,
            },
        },
        "stream": stream,
    }


async def summarize(
    diarized_prompt: str,
    *,
    context: str | None = None,
    email_tone: str = EMAIL_TONE_FORMAL,
) -> dict:
    """Return parsed JSON dict matching JSON_SCHEMA."""
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            OPENROUTER_URL,
            headers=_headers(),
            json=_body(
                diarized_prompt, stream=False, context=context, email_tone=email_tone
            ),
        )
        response.raise_for_status()
        result = response.json()

    content = result["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    try:
        validate(instance=parsed, schema=JSON_SCHEMA)
    except ValidationError as exc:
        raise ValueError(f"summarizer schema validation failed: {exc.message}") from exc
    return parsed


async def summarize_stream(
    diarized_prompt: str,
    *,
    context: str | None = None,
    email_tone: str = EMAIL_TONE_FORMAL,
) -> AsyncIterator[str]:
    """Yield raw SSE delta content fragments. Yields '[DONE]' once at end."""
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            OPENROUTER_URL,
            headers=_headers(),
            json=_body(
                diarized_prompt, stream=True, context=context, email_tone=email_tone
            ),
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
    yield "[DONE]"
