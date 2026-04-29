from __future__ import annotations

import json
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import ChatMessage, Meeting, MeetingStatus, Summary, Transcript
from app.schemas import ChatAskBody, ChatMessageRead
from app.services import chat as chat_service

router = APIRouter()


async def _get_ready_meeting(meeting_id: str, session: AsyncSession) -> Meeting:
    """Return meeting if it is done with Transcript + Summary; else raise 409."""
    meeting = await session.get(Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=404, detail="meeting not found")

    if meeting.status != MeetingStatus.DONE:
        raise HTTPException(
            status_code=409,
            detail="meeting not ready: processing not complete",
        )

    transcript = await session.get(Transcript, meeting_id)
    if transcript is None:
        raise HTTPException(
            status_code=409,
            detail="meeting not ready: transcript missing",
        )

    summary_exists = (
        await session.execute(
            select(Summary.id)
            .where(Summary.meeting_id == meeting_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if summary_exists is None:
        raise HTTPException(
            status_code=409,
            detail="meeting not ready: summary missing",
        )

    return meeting


@router.get("/messages", response_model=list[ChatMessageRead])
async def list_chat_messages(
    meeting_id: str,
    session: AsyncSession = Depends(get_session),
) -> list[ChatMessageRead]:
    rows = (
        await session.execute(
            select(ChatMessage)
            .where(ChatMessage.meeting_id == meeting_id)
            .order_by(ChatMessage.created_at.asc())
        )
    ).scalars().all()
    return [ChatMessageRead.model_validate(r) for r in rows]


@router.post("/ask")
async def ask_chat(
    meeting_id: str,
    body: ChatAskBody,
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    await _get_ready_meeting(meeting_id, session)

    # Persist user message before starting the stream so it's durable even if
    # stream fails.
    user_msg = ChatMessage(
        id=str(uuid.uuid4()),
        meeting_id=meeting_id,
        role="user",
        content=body.message,
    )
    session.add(user_msg)
    await session.commit()

    # Load history (after commit so user msg is included) and build context.
    history_rows = (
        await session.execute(
            select(ChatMessage)
            .where(ChatMessage.meeting_id == meeting_id)
            .order_by(ChatMessage.created_at.asc())
        )
    ).scalars().all()

    # Build OpenAI-style history list excluding the just-inserted user message
    # (it will be passed separately as user_message to chat_stream).
    history: list[dict] = [
        {"role": row.role, "content": row.content}
        for row in history_rows
        if row.id != user_msg.id
    ]

    meeting_context = await chat_service.build_meeting_context(session, meeting_id)

    async def event_source() -> AsyncGenerator[str, None]:
        accumulated: list[str] = []
        assistant_id = str(uuid.uuid4())
        try:
            async for delta in chat_service.chat_stream(
                meeting_context, history, body.message
            ):
                accumulated.append(delta)
                payload = json.dumps({"type": "delta", "text": delta}, ensure_ascii=False)
                yield f"data: {payload}\n\n"

            # Stream completed — persist assistant message.
            full_reply = "".join(accumulated)
            async with session.begin_nested():
                assistant_msg = ChatMessage(
                    id=assistant_id,
                    meeting_id=meeting_id,
                    role="assistant",
                    content=full_reply,
                )
                session.add(assistant_msg)
            await session.commit()

            done_payload = json.dumps({"type": "done", "id": assistant_id}, ensure_ascii=False)
            yield f"data: {done_payload}\n\n"

        except Exception as exc:
            err_payload = json.dumps(
                {"type": "error", "message": str(exc)}, ensure_ascii=False
            )
            yield f"data: {err_payload}\n\n"
            # Do NOT persist a partial assistant message on error.

    return StreamingResponse(event_source(), media_type="text/event-stream")


@router.delete("/messages", status_code=204)
async def clear_chat_messages(
    meeting_id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    await session.execute(
        delete(ChatMessage).where(ChatMessage.meeting_id == meeting_id)
    )
    await session.commit()
