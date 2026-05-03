from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_session
from app.models import MeetingTag, Tag, User
from app.schemas import TagCreate, TagRead, TagWithCount

router = APIRouter()


@router.get("", response_model=list[TagWithCount])
async def list_tags(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[TagWithCount]:
    rows = (
        await session.execute(
            select(Tag, func.count(MeetingTag.meeting_id))
            .outerjoin(MeetingTag, MeetingTag.tag_id == Tag.id)
            .where(Tag.owner_id == user.id)
            .group_by(Tag.id)
            .order_by(Tag.name.asc())
        )
    ).all()
    return [
        TagWithCount(
            id=t.id,
            name=t.name,
            created_at=t.created_at,
            meeting_count=count,
        )
        for t, count in rows
    ]


@router.post("", response_model=TagRead, status_code=status.HTTP_201_CREATED)
async def create_tag(
    body: TagCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> TagRead:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    existing = (
        await session.execute(
            select(Tag).where(Tag.name == name, Tag.owner_id == user.id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return TagRead.model_validate(existing)
    t = Tag(name=name, owner_id=user.id)
    session.add(t)
    await session.commit()
    await session.refresh(t)
    return TagRead.model_validate(t)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    t = await session.get(Tag, tag_id)
    if t is None or t.owner_id != user.id:
        raise HTTPException(status_code=404, detail="tag not found")
    await session.delete(t)
    await session.commit()
