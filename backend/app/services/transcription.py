from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from elevenlabs import ElevenLabs

from app.config import settings


_WORD_TYPES_FOR_TEXT = {"word", "spacing"}


@dataclass
class TranscriptionResult:
    plain_text: str
    words: list[dict]
    speaker_ids: list[str]
    raw: dict
    language_code: str


def _serialize_word(word: Any) -> dict:
    if hasattr(word, "model_dump"):
        return word.model_dump()
    if isinstance(word, dict):
        return dict(word)
    return {
        "text": getattr(word, "text", ""),
        "start": getattr(word, "start", None),
        "end": getattr(word, "end", None),
        "type": getattr(word, "type", None),
        "speaker_id": getattr(word, "speaker_id", None),
    }


def _serialize_response(response: Any) -> dict:
    if hasattr(response, "model_dump"):
        return response.model_dump()
    if isinstance(response, dict):
        return dict(response)
    return {}


def transcribe(
    audio_path: Path,
    *,
    num_speakers: int | None = None,
    keyterms: list[str] | None = None,
) -> TranscriptionResult:
    audio_path = Path(audio_path)
    client = ElevenLabs(api_key=settings.ELEVENLABS_API_KEY)

    kwargs: dict[str, Any] = {
        "model_id": "scribe_v2",
        "language_code": "fas",
        "diarize": True,
        "timestamps_granularity": "word",
        "tag_audio_events": False,
        "no_verbatim": True,
    }
    if num_speakers is not None and num_speakers > 0:
        kwargs["num_speakers"] = int(num_speakers)
    if keyterms:
        kwargs["keyterms"] = list(keyterms)

    try:
        with audio_path.open("rb") as f:
            response = client.speech_to_text.convert(file=f, **kwargs)
    except Exception as exc:
        raise RuntimeError(f"Scribe failed: {exc}") from exc

    raw_words = getattr(response, "words", None) or []
    serialized_words = [_serialize_word(w) for w in raw_words]

    plain_text_parts: list[str] = []
    speaker_ids: list[str] = []
    seen_speakers: set[str] = set()

    for word in serialized_words:
        word_type = word.get("type")
        if word_type in _WORD_TYPES_FOR_TEXT:
            plain_text_parts.append(word.get("text", "") or "")
        speaker_id = word.get("speaker_id")
        if speaker_id is not None and speaker_id not in seen_speakers:
            seen_speakers.add(speaker_id)
            speaker_ids.append(speaker_id)

    plain_text = "".join(plain_text_parts)
    language_code = getattr(response, "language_code", None) or "fas"
    raw = _serialize_response(response)

    return TranscriptionResult(
        plain_text=plain_text,
        words=serialized_words,
        speaker_ids=speaker_ids,
        raw=raw,
        language_code=language_code,
    )


async def transcribe_async(
    audio_path: Path,
    *,
    num_speakers: int | None = None,
    keyterms: list[str] | None = None,
) -> TranscriptionResult:
    return await asyncio.to_thread(
        transcribe,
        audio_path,
        num_speakers=num_speakers,
        keyterms=keyterms,
    )
