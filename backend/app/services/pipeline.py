from __future__ import annotations

import traceback
from pathlib import Path

from sqlalchemy import select

from app.db import SessionLocal
from app.config import settings
from app.models import EmailTone, Meeting, MeetingStatus, Series, Speaker, Summary, Transcript
from app.services import glossary, speakers, summarizer
from app.services.summarizer import EMAIL_TONE_CASUAL, EMAIL_TONE_FORMAL
from app.services.transcription import TranscriptionResult, transcribe_async


_GAP_THRESHOLD_S = 1.2


def _word_text(word: dict) -> str:
    return word.get("text", "") or ""


def _word_speaker(word: dict) -> str | None:
    sid = word.get("speaker_id")
    if sid is None:
        return None
    return str(sid)


def _word_start(word: dict) -> float | None:
    val = word.get("start")
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _word_end(word: dict) -> float | None:
    val = word.get("end")
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def build_diarized_prompt(words: list[dict]) -> str:
    """Group consecutive same-speaker words into segments. Split on speaker change
    or word.start - prev_end > 1.2s. Each segment becomes
    `[speaker_id start-end] text`.
    """
    segments: list[tuple[str, float, float, str]] = []

    cur_speaker: str | None = None
    cur_start: float | None = None
    cur_end: float | None = None
    cur_text_parts: list[str] = []

    def flush() -> None:
        if cur_speaker is None or cur_start is None or cur_end is None:
            return
        text = "".join(cur_text_parts).strip()
        if not text:
            return
        segments.append((cur_speaker, cur_start, cur_end, text))

    for word in words:
        speaker = _word_speaker(word) or "speaker_0"
        start = _word_start(word)
        end = _word_end(word)
        text = _word_text(word)

        # If we have no timing, fall back to previous endpoints to keep grouping.
        effective_start = start if start is not None else cur_end
        effective_end = end if end is not None else effective_start

        gap = None
        if cur_end is not None and effective_start is not None:
            gap = effective_start - cur_end

        speaker_changed = cur_speaker is not None and speaker != cur_speaker
        gap_too_big = gap is not None and gap > _GAP_THRESHOLD_S

        if cur_speaker is None:
            cur_speaker = speaker
            cur_start = effective_start if effective_start is not None else 0.0
            cur_end = effective_end if effective_end is not None else cur_start
            cur_text_parts = [text]
            continue

        if speaker_changed or gap_too_big:
            flush()
            cur_speaker = speaker
            cur_start = effective_start if effective_start is not None else (cur_end or 0.0)
            cur_end = effective_end if effective_end is not None else cur_start
            cur_text_parts = [text]
        else:
            cur_text_parts.append(text)
            if effective_end is not None:
                cur_end = effective_end

    flush()

    return "\n".join(
        f"[{speaker} {start:.2f}-{end:.2f}] {text}"
        for speaker, start, end, text in segments
    )


async def _set_status(meeting_id: str, status: MeetingStatus, *, error: str | None = None) -> None:
    async with SessionLocal() as session:
        meeting = await session.get(Meeting, meeting_id)
        if meeting is None:
            return
        meeting.status = status
        if error is not None:
            meeting.error_message = error
        await session.commit()


async def _persist_transcript(meeting_id: str, result: TranscriptionResult) -> None:
    async with SessionLocal() as session:
        meeting = await session.get(Meeting, meeting_id)
        if meeting is None:
            return

        existing = await session.get(Transcript, meeting_id)
        if existing is not None:
            existing.raw_json = result.raw
            existing.plain_text = result.plain_text
            existing.words_json = result.words
        else:
            session.add(
                Transcript(
                    meeting_id=meeting_id,
                    raw_json=result.raw,
                    plain_text=result.plain_text,
                    words_json=result.words,
                )
            )

        existing_speakers = {
            sp.speaker_id
            for sp in (
                await session.execute(
                    select(Speaker).where(Speaker.meeting_id == meeting_id)
                )
            )
            .scalars()
            .all()
        }
        for sid in result.speaker_ids:
            if sid in existing_speakers:
                continue
            session.add(Speaker(meeting_id=meeting_id, speaker_id=sid, display_name=None))

        if result.language_code:
            meeting.language = result.language_code
        meeting.status = MeetingStatus.SUMMARIZING
        await session.commit()


async def _apply_speaker_names_from_summary(
    meeting_id: str, mapping: list[dict] | None
) -> None:
    if not mapping:
        return
    async with SessionLocal() as session:
        meeting = await session.get(Meeting, meeting_id)
        if meeting is None:
            return
        await speakers.apply_speaker_names(session, meeting, mapping)


async def _load_transcript_words(meeting_id: str) -> list[dict] | None:
    async with SessionLocal() as session:
        transcript = await session.get(Transcript, meeting_id)
        if transcript is None:
            return None
        return list(transcript.words_json or [])


async def _persist_summary(meeting_id: str, data: dict, *, email_tone: str) -> str:
    async with SessionLocal() as session:
        meeting = await session.get(Meeting, meeting_id)
        if meeting is None:
            raise RuntimeError(f"meeting {meeting_id} disappeared mid-pipeline")

        email_obj = data.get("email_draft") or {}
        summary = Summary(
            meeting_id=meeting_id,
            exec_summary=data.get("exec_summary", "") or "",
            action_items_json=list(data.get("action_items") or []),
            decisions_json=list(data.get("decisions") or []),
            minutes_json=list(data.get("minutes") or []),
            qa_json=list(data.get("qa") or []),
            open_questions_json=list(data.get("open_questions") or []),
            email_subject=(email_obj.get("subject") or None),
            email_draft=(email_obj.get("body") or None),
            email_tone=email_tone,
            model=settings.OPENROUTER_MODEL,
        )
        session.add(summary)
        meeting.status = MeetingStatus.DONE
        meeting.error_message = None
        await session.commit()
        await session.refresh(summary)
        return summary.id


class _MeetingCtx:
    __slots__ = ("num_speakers", "meeting_brief", "series_id", "email_tone", "keyterms")

    def __init__(
        self,
        num_speakers: int | None,
        meeting_brief: str | None,
        series_id: str | None,
        email_tone: str,
        keyterms: list[str],
    ) -> None:
        self.num_speakers = num_speakers
        self.meeting_brief = meeting_brief
        self.series_id = series_id
        self.email_tone = email_tone
        self.keyterms = keyterms


async def _load_meeting_context(meeting_id: str) -> _MeetingCtx | None:
    async with SessionLocal() as session:
        meeting = await session.get(Meeting, meeting_id)
        if meeting is None:
            return None
        series_id = meeting.series_id
        email_tone = EMAIL_TONE_FORMAL
        keyterms: list[str] = []
        if series_id:
            series = await session.get(Series, series_id)
            if series is not None:
                email_tone = (
                    EMAIL_TONE_CASUAL
                    if series.email_tone == EmailTone.CASUAL
                    else EMAIL_TONE_FORMAL
                )
            keyterms = await glossary.get_active_keyterms(session, series_id)
        return _MeetingCtx(
            num_speakers=meeting.num_speakers,
            meeting_brief=meeting.meeting_brief,
            series_id=series_id,
            email_tone=email_tone,
            keyterms=keyterms,
        )


async def run_pipeline(meeting_id: str) -> None:
    """Drive a meeting through transcribing -> summarizing -> done.
    Idempotent: returns immediately if status is already DONE.
    """
    try:
        async with SessionLocal() as session:
            meeting = await session.get(Meeting, meeting_id)
            if meeting is None:
                return
            if meeting.status == MeetingStatus.DONE:
                return
            audio_path = meeting.audio_path
            meeting.status = MeetingStatus.TRANSCRIBING
            meeting.error_message = None
            await session.commit()

        ctx = await _load_meeting_context(meeting_id)
        if ctx is None:
            return

        result = await transcribe_async(
            Path(audio_path),
            num_speakers=ctx.num_speakers,
            keyterms=ctx.keyterms or None,
        )
        await _persist_transcript(meeting_id, result)

        words = await _load_transcript_words(meeting_id)
        if not words:
            raise RuntimeError("transcript persisted but words_json is empty")
        prompt = build_diarized_prompt(words)

        data = await summarizer.summarize(
            prompt, context=ctx.meeting_brief, email_tone=ctx.email_tone
        )
        await _apply_speaker_names_from_summary(meeting_id, data.get("speaker_names"))
        await _persist_summary(meeting_id, data, email_tone=ctx.email_tone)
    except Exception:
        await _set_status(
            meeting_id,
            MeetingStatus.FAILED,
            error=traceback.format_exc(),
        )


async def regenerate_summary(meeting_id: str) -> str:
    """Re-run summarization against an existing transcript. Returns new Summary id."""
    try:
        words = await _load_transcript_words(meeting_id)
        if not words:
            raise RuntimeError("cannot regenerate: no transcript for this meeting")

        ctx = await _load_meeting_context(meeting_id)
        if ctx is None:
            raise RuntimeError(f"meeting {meeting_id} not found")
        await _set_status(meeting_id, MeetingStatus.SUMMARIZING, error=None)

        prompt = build_diarized_prompt(words)
        data = await summarizer.summarize(
            prompt, context=ctx.meeting_brief, email_tone=ctx.email_tone
        )
        await _apply_speaker_names_from_summary(meeting_id, data.get("speaker_names"))
        return await _persist_summary(meeting_id, data, email_tone=ctx.email_tone)
    except Exception:
        await _set_status(
            meeting_id,
            MeetingStatus.FAILED,
            error=traceback.format_exc(),
        )
        raise
