from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.models import EmailTone, KeytermSource, MeetingStatus


class MeetingCreate(BaseModel):
    title: str | None = None
    num_speakers: int | None = None
    meeting_brief: str | None = None
    series_id: str | None = None
    tag_ids: list[str] = []


class MeetingPatch(BaseModel):
    title: str | None = None
    series_id: str | None = None
    tag_ids: list[str] | None = None


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime


class TagCreate(BaseModel):
    name: str


class TagWithCount(TagRead):
    meeting_count: int = 0


class SeriesCreate(BaseModel):
    name: str
    email_tone: EmailTone = EmailTone.FORMAL


class SeriesUpdate(BaseModel):
    name: str | None = None
    email_tone: EmailTone | None = None


class SeriesRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email_tone: EmailTone
    created_at: datetime
    updated_at: datetime


class SeriesWithCount(SeriesRead):
    meeting_count: int = 0


class SeriesSuggestionRead(BaseModel):
    series_id: str
    name: str
    score: float


class KeyTermRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    series_id: str
    term: str
    source: KeytermSource
    created_at: datetime


class KeyTermCreate(BaseModel):
    term: str


class MeetingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str | None
    status: MeetingStatus
    original_filename: str
    language: str
    duration_s: float | None
    num_speakers: int | None
    meeting_brief: str | None
    series_id: str | None = None
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class SpeakerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    speaker_id: str
    display_name: str | None


class SpeakerRename(BaseModel):
    display_name: str


class MeetingDetail(MeetingRead):
    speakers: list[SpeakerRead] = []
    latest_summary_id: str | None = None
    series: SeriesRead | None = None
    tags: list[TagRead] = []


class TranscriptRead(BaseModel):
    meeting_id: str
    plain_text: str
    words: list[dict[str, Any]]


class ActionItem(BaseModel):
    text: str
    owner: str | None = None
    due_date: str | None = None


class MinutesSegment(BaseModel):
    speaker_id: str
    text: str
    start_s: float
    end_s: float


class QAItem(BaseModel):
    question: str
    answer: str | None = None


class OpenQuestion(BaseModel):
    question: str
    owner: str | None = None


class EmailDraft(BaseModel):
    subject: str | None = None
    body: str | None = None
    tone: str | None = None


class SummaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    meeting_id: str
    model: str
    exec_summary: str
    action_items: list[ActionItem]
    decisions: list[str]
    minutes: list[MinutesSegment]
    qa: list[QAItem] = []
    open_questions: list[OpenQuestion] = []
    email: EmailDraft | None = None
    speakers: dict[str, SpeakerRead] = {}
    created_at: datetime


class RealtimeToken(BaseModel):
    token: str
    expires_at: str | None = None
    keyterms: list[str] = []


class RealtimeTokenRequest(BaseModel):
    series_id: str | None = None
