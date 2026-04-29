from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class MeetingStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    TRANSCRIBING = "transcribing"
    SUMMARIZING = "summarizing"
    DONE = "done"
    FAILED = "failed"


class EmailTone(str, enum.Enum):
    FORMAL = "formal"
    CASUAL = "casual"


class KeytermSource(str, enum.Enum):
    MANUAL = "manual"
    SUGGESTED = "suggested"
    ACCEPTED = "accepted"


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[MeetingStatus] = mapped_column(
        Enum(MeetingStatus, name="meeting_status"), default=MeetingStatus.UPLOADED, nullable=False
    )
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    audio_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    language: Mapped[str] = mapped_column(String(8), default="fas", nullable=False)
    duration_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    num_speakers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    meeting_brief: Mapped[str | None] = mapped_column(Text, nullable=True)
    series_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("series.id", ondelete="SET NULL"), nullable=True, index=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )

    transcript: Mapped[Transcript | None] = relationship(
        back_populates="meeting", uselist=False, cascade="all, delete-orphan"
    )
    summaries: Mapped[list[Summary]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", order_by="Summary.created_at.desc()"
    )
    speakers: Mapped[list[Speaker]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )
    series: Mapped[Series | None] = relationship(back_populates="meetings")
    tags: Mapped[list[Tag]] = relationship(
        secondary="meeting_tags", back_populates="meetings"
    )


class Transcript(Base):
    __tablename__ = "transcripts"

    meeting_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True
    )
    raw_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    plain_text: Mapped[str] = mapped_column(Text, nullable=False)
    words_json: Mapped[list] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    meeting: Mapped[Meeting] = relationship(back_populates="transcript")


class Summary(Base):
    __tablename__ = "summaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    meeting_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    exec_summary: Mapped[str] = mapped_column(Text, nullable=False)
    action_items_json: Mapped[list] = mapped_column(JSON, nullable=False)
    decisions_json: Mapped[list] = mapped_column(JSON, nullable=False)
    minutes_json: Mapped[list] = mapped_column(JSON, nullable=False)
    qa_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    open_questions_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    email_draft: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    email_tone: Mapped[str | None] = mapped_column(String(16), nullable=True)
    model: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    meeting: Mapped[Meeting] = relationship(back_populates="summaries")


class Speaker(Base):
    __tablename__ = "speakers"

    meeting_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True
    )
    speaker_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    meeting: Mapped[Meeting] = relationship(back_populates="speakers")


class Series(Base):
    __tablename__ = "series"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email_tone: Mapped[EmailTone] = mapped_column(
        Enum(EmailTone, name="email_tone"), default=EmailTone.FORMAL, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )

    meetings: Mapped[list[Meeting]] = relationship(back_populates="series")
    keyterms: Mapped[list[SeriesKeyterm]] = relationship(
        back_populates="series", cascade="all, delete-orphan"
    )
    speaker_names: Mapped[list[SeriesSpeakerName]] = relationship(
        back_populates="series", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("name", name="uq_series_name"),)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    meetings: Mapped[list[Meeting]] = relationship(
        secondary="meeting_tags", back_populates="tags"
    )

    __table_args__ = (UniqueConstraint("name", name="uq_tag_name"),)


class MeetingTag(Base):
    __tablename__ = "meeting_tags"

    meeting_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class SeriesKeyterm(Base):
    __tablename__ = "series_keyterms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    series_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("series.id", ondelete="CASCADE"), nullable=False, index=True
    )
    term: Mapped[str] = mapped_column(String(80), nullable=False)
    source: Mapped[KeytermSource] = mapped_column(
        Enum(KeytermSource, name="keyterm_source"), default=KeytermSource.MANUAL, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    series: Mapped[Series] = relationship(back_populates="keyterms")

    __table_args__ = (UniqueConstraint("series_id", "term", name="uq_series_keyterm"),)


class SeriesSpeakerName(Base):
    __tablename__ = "series_speaker_names"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    series_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("series.id", ondelete="CASCADE"), nullable=False, index=True
    )
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )

    series: Mapped[Series] = relationship(back_populates="speaker_names")

    __table_args__ = (UniqueConstraint("series_id", "display_name", name="uq_series_speaker_name"),)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    meeting_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    __table_args__ = (
        Index("ix_chat_messages_meeting_id_created_at", "meeting_id", "created_at"),
    )
