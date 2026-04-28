from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import delete

from app.db import get_session
from app.models import Meeting, MeetingStatus, MeetingTag, Series, Speaker, Summary, Tag, Transcript
from app.schemas import (
    ActionItem,
    EmailDraft,
    MeetingDetail,
    MeetingPatch,
    MeetingRead,
    MinutesSegment,
    OpenQuestion,
    QAItem,
    SeriesRead,
    SeriesSuggestionRead,
    SpeakerRead,
    SpeakerRename,
    SummaryRead,
    TagRead,
    TranscriptRead,
)
from app.services import glossary, pipeline, series_match, storage, summarizer

router = APIRouter()

MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB
_UPLOAD_CHUNK = 1024 * 1024  # 1 MB


def _meeting_detail(
    meeting: Meeting,
    speakers: list[Speaker],
    latest_summary_id: str | None,
    *,
    series: Series | None,
    tags: list[Tag],
) -> MeetingDetail:
    return MeetingDetail(
        id=meeting.id,
        title=meeting.title,
        status=meeting.status,
        original_filename=meeting.original_filename,
        language=meeting.language,
        duration_s=meeting.duration_s,
        num_speakers=meeting.num_speakers,
        meeting_brief=meeting.meeting_brief,
        series_id=meeting.series_id,
        error_message=meeting.error_message,
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
        speakers=[SpeakerRead.model_validate(s) for s in speakers],
        latest_summary_id=latest_summary_id,
        series=SeriesRead.model_validate(series) if series else None,
        tags=[TagRead.model_validate(t) for t in tags],
    )


async def _resolve_tags(
    session: AsyncSession, tag_ids: list[str]
) -> list[Tag]:
    if not tag_ids:
        return []
    rows = (
        await session.execute(select(Tag).where(Tag.id.in_(tag_ids)))
    ).scalars().all()
    return list(rows)


async def _set_meeting_tags(
    session: AsyncSession, meeting_id: str, tag_ids: list[str]
) -> None:
    await session.execute(
        delete(MeetingTag).where(MeetingTag.meeting_id == meeting_id)
    )
    for tid in tag_ids:
        session.add(MeetingTag(meeting_id=meeting_id, tag_id=tid))


async def _resolve_series(session: AsyncSession, series_id: str | None) -> Series | None:
    if not series_id:
        return None
    s = await session.get(Series, series_id)
    if s is None:
        raise HTTPException(status_code=400, detail="series_id does not exist")
    return s


async def _save_upload_with_size_check(file: UploadFile, meeting_id: str) -> tuple[str, str, int]:
    """Stream upload to disk while enforcing MAX_UPLOAD_BYTES. Returns (path, original_filename, bytes_written)."""
    from app.config import settings as _settings

    _settings.audio_dir.mkdir(parents=True, exist_ok=True)

    ext = storage._resolve_extension(file)
    target = _settings.audio_dir / f"{meeting_id}{ext}"
    original_filename = file.filename or f"{meeting_id}{ext}"
    written = 0

    try:
        with target.open("wb") as out:
            while True:
                chunk = await file.read(_UPLOAD_CHUNK)
                if not chunk:
                    break
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"file exceeds max size of {MAX_UPLOAD_BYTES} bytes",
                    )
                out.write(chunk)
    except HTTPException:
        target.unlink(missing_ok=True)
        raise
    except Exception:
        target.unlink(missing_ok=True)
        raise

    return str(target), original_filename, written


@router.post("/upload", response_model=MeetingRead, status_code=status.HTTP_201_CREATED)
async def upload_meeting(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str | None = Form(None),
    num_speakers: int | None = Form(None),
    meeting_brief: str | None = Form(None),
    series_id: str | None = Form(None),
    tag_ids: list[str] = Form([]),
    session: AsyncSession = Depends(get_session),
) -> MeetingRead:
    if not file.filename and not file.content_type:
        raise HTTPException(status_code=400, detail="missing file")

    declared_size = getattr(file, "size", None)
    if declared_size is not None and declared_size > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"file exceeds max size of {MAX_UPLOAD_BYTES} bytes",
        )

    if num_speakers is not None and (num_speakers < 1 or num_speakers > 32):
        raise HTTPException(status_code=400, detail="num_speakers must be 1-32")

    series = await _resolve_series(session, series_id)
    valid_tag_ids = [t.id for t in await _resolve_tags(session, tag_ids)]

    meeting_id = str(uuid.uuid4())
    audio_path, original_filename, _ = await _save_upload_with_size_check(file, meeting_id)

    duration = storage.probe_duration_seconds(Path(audio_path))

    meeting = Meeting(
        id=meeting_id,
        title=title,
        status=MeetingStatus.UPLOADED,
        original_filename=original_filename,
        audio_path=audio_path,
        duration_s=duration,
        num_speakers=num_speakers,
        meeting_brief=(meeting_brief.strip() if meeting_brief else None) or None,
        series_id=series.id if series else None,
    )
    session.add(meeting)
    await session.flush()
    if valid_tag_ids:
        await _set_meeting_tags(session, meeting_id, valid_tag_ids)
    await session.commit()
    await session.refresh(meeting)

    background_tasks.add_task(pipeline.run_pipeline, meeting_id)

    return MeetingRead.model_validate(meeting)


@router.get("/suggest-series", response_model=SeriesSuggestionRead | None)
async def suggest_series_endpoint(
    title: str = "",
    session: AsyncSession = Depends(get_session),
) -> SeriesSuggestionRead | None:
    suggestion = await series_match.suggest_series(session, title)
    if suggestion is None:
        return None
    return SeriesSuggestionRead(
        series_id=suggestion.series_id,
        name=suggestion.name,
        score=suggestion.score,
    )


@router.get("", response_model=list[MeetingRead])
async def list_meetings(
    series_id: str | None = Query(None),
    tag_ids: list[str] | None = Query(None),
    q: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> list[MeetingRead]:
    stmt = select(Meeting).order_by(Meeting.created_at.desc())
    if series_id:
        stmt = stmt.where(Meeting.series_id == series_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(Meeting.title.ilike(like))
    if tag_ids:
        stmt = stmt.join(Meeting.tags).where(Tag.id.in_(tag_ids)).distinct()
    rows = (await session.execute(stmt)).scalars().all()
    return [MeetingRead.model_validate(m) for m in rows]


async def _latest_summary_id(session: AsyncSession, meeting_id: str) -> str | None:
    row = await session.execute(
        select(Summary.id)
        .where(Summary.meeting_id == meeting_id)
        .order_by(Summary.created_at.desc())
        .limit(1)
    )
    return row.scalar_one_or_none()


async def _meeting_speakers(session: AsyncSession, meeting_id: str) -> list[Speaker]:
    rows = await session.execute(
        select(Speaker).where(Speaker.meeting_id == meeting_id).order_by(Speaker.speaker_id)
    )
    return list(rows.scalars().all())


async def _load_meeting_assoc(
    session: AsyncSession, meeting: Meeting
) -> tuple[Series | None, list[Tag]]:
    series = await session.get(Series, meeting.series_id) if meeting.series_id else None
    tag_rows = (
        await session.execute(
            select(Tag)
            .join(Meeting.tags)
            .where(Meeting.id == meeting.id)
        )
    ).scalars().all()
    return series, list(tag_rows)


@router.get("/{meeting_id}", response_model=MeetingDetail)
async def get_meeting(meeting_id: str, session: AsyncSession = Depends(get_session)) -> MeetingDetail:
    meeting = await session.get(Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=404, detail="meeting not found")

    speakers = await _meeting_speakers(session, meeting_id)
    latest_id = await _latest_summary_id(session, meeting_id)
    series, tags = await _load_meeting_assoc(session, meeting)
    return _meeting_detail(meeting, speakers, latest_id, series=series, tags=tags)


@router.patch("/{meeting_id}", response_model=MeetingDetail)
async def patch_meeting(
    meeting_id: str,
    body: MeetingPatch,
    session: AsyncSession = Depends(get_session),
) -> MeetingDetail:
    meeting = await session.get(Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=404, detail="meeting not found")

    if body.title is not None:
        meeting.title = body.title.strip() or None

    if body.series_id is not None:
        if body.series_id == "":
            meeting.series_id = None
        else:
            series = await _resolve_series(session, body.series_id)
            meeting.series_id = series.id if series else None

    if body.tag_ids is not None:
        valid_tag_ids = [t.id for t in await _resolve_tags(session, body.tag_ids)]
        await _set_meeting_tags(session, meeting_id, valid_tag_ids)

    await session.commit()
    await session.refresh(meeting)

    speakers = await _meeting_speakers(session, meeting_id)
    latest_id = await _latest_summary_id(session, meeting_id)
    series_obj, tags = await _load_meeting_assoc(session, meeting)
    return _meeting_detail(
        meeting, speakers, latest_id, series=series_obj, tags=tags
    )


@router.get("/{meeting_id}/transcript", response_model=TranscriptRead)
async def get_transcript(meeting_id: str, session: AsyncSession = Depends(get_session)) -> TranscriptRead:
    transcript = await session.get(Transcript, meeting_id)
    if transcript is None:
        raise HTTPException(status_code=404, detail="transcript not found")
    return TranscriptRead(
        meeting_id=transcript.meeting_id,
        plain_text=transcript.plain_text,
        words=list(transcript.words_json or []),
    )


def _coerce_action_items(raw: list[Any] | None) -> list[ActionItem]:
    out: list[ActionItem] = []
    for item in raw or []:
        if isinstance(item, dict):
            out.append(ActionItem(**item))
    return out


def _coerce_minutes(raw: list[Any] | None) -> list[MinutesSegment]:
    out: list[MinutesSegment] = []
    for item in raw or []:
        if isinstance(item, dict):
            out.append(MinutesSegment(**item))
    return out


def _coerce_decisions(raw: list[Any] | None) -> list[str]:
    return [str(x) for x in (raw or []) if x is not None]


def _coerce_qa(raw: list[Any] | None) -> list[QAItem]:
    out: list[QAItem] = []
    for item in raw or []:
        if isinstance(item, dict):
            out.append(QAItem(question=str(item.get("question") or ""), answer=item.get("answer")))
    return out


def _coerce_open_questions(raw: list[Any] | None) -> list[OpenQuestion]:
    out: list[OpenQuestion] = []
    for item in raw or []:
        if isinstance(item, dict):
            out.append(
                OpenQuestion(
                    question=str(item.get("question") or ""),
                    owner=item.get("owner"),
                )
            )
    return out


@router.get("/{meeting_id}/summary", response_model=SummaryRead)
async def get_summary(meeting_id: str, session: AsyncSession = Depends(get_session)) -> SummaryRead:
    meeting = await session.get(Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=404, detail="meeting not found")

    row = await session.execute(
        select(Summary)
        .where(Summary.meeting_id == meeting_id)
        .order_by(Summary.created_at.desc())
        .limit(1)
    )
    summary = row.scalar_one_or_none()
    if summary is None:
        raise HTTPException(status_code=404, detail="summary not found")

    speakers = await _meeting_speakers(session, meeting_id)
    speaker_map = {sp.speaker_id: SpeakerRead.model_validate(sp) for sp in speakers}

    email_obj: EmailDraft | None = None
    if summary.email_draft or summary.email_subject:
        email_obj = EmailDraft(
            subject=summary.email_subject,
            body=summary.email_draft,
            tone=summary.email_tone,
        )

    return SummaryRead(
        id=summary.id,
        meeting_id=summary.meeting_id,
        model=summary.model,
        exec_summary=summary.exec_summary,
        action_items=_coerce_action_items(summary.action_items_json),
        decisions=_coerce_decisions(summary.decisions_json),
        minutes=_coerce_minutes(summary.minutes_json),
        qa=_coerce_qa(summary.qa_json),
        open_questions=_coerce_open_questions(summary.open_questions_json),
        email=email_obj,
        speakers=speaker_map,
        created_at=summary.created_at,
    )


@router.patch("/{meeting_id}/speakers/{speaker_id}", response_model=SpeakerRead)
async def rename_speaker(
    meeting_id: str,
    speaker_id: str,
    body: SpeakerRename,
    session: AsyncSession = Depends(get_session),
) -> SpeakerRead:
    meeting = await session.get(Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=404, detail="meeting not found")

    speaker = await session.get(Speaker, {"meeting_id": meeting_id, "speaker_id": speaker_id})
    if speaker is None:
        speaker = Speaker(
            meeting_id=meeting_id,
            speaker_id=speaker_id,
            display_name=body.display_name,
        )
        session.add(speaker)
    else:
        speaker.display_name = body.display_name

    await session.commit()
    await session.refresh(speaker)

    if meeting.series_id and body.display_name and body.display_name.strip():
        await glossary.upsert_speaker_name(session, meeting.series_id, body.display_name)
        await glossary.add_suggested_terms(
            session, meeting.series_id, [body.display_name]
        )

    return SpeakerRead.model_validate(speaker)


@router.post("/{meeting_id}/regenerate-summary")
async def regenerate(
    meeting_id: str,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    meeting = await session.get(Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=404, detail="meeting not found")

    transcript = await session.get(Transcript, meeting_id)
    if transcript is None:
        raise HTTPException(status_code=400, detail="cannot regenerate without a transcript")

    # Flip status synchronously so the client sees the in-flight state on the
    # very next refetch (the background task takes a moment to start).
    meeting.status = MeetingStatus.SUMMARIZING
    meeting.error_message = None
    await session.commit()

    background_tasks.add_task(pipeline.regenerate_summary, meeting_id)
    return {"queued": True, "meeting_id": meeting_id}


@router.get("/{meeting_id}/summary/stream")
async def stream_summary(meeting_id: str) -> StreamingResponse:
    from app.db import SessionLocal

    async with SessionLocal() as session:
        meeting = await session.get(Meeting, meeting_id)
        if meeting is None:
            raise HTTPException(status_code=404, detail="meeting not found")
        transcript = await session.get(Transcript, meeting_id)
        if transcript is None:
            raise HTTPException(status_code=404, detail="transcript not found")
        words = list(transcript.words_json or [])
        meeting_brief = meeting.meeting_brief

    prompt = pipeline.build_diarized_prompt(words)

    async def event_source():
        try:
            async for delta in summarizer.summarize_stream(prompt, context=meeting_brief):
                if delta == "[DONE]":
                    yield "data: [DONE]\n\n"
                    return
                # SSE: prefix each line of the delta with `data: `
                for line in delta.splitlines() or [""]:
                    yield f"data: {line}\n"
                yield "\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {exc}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream")
