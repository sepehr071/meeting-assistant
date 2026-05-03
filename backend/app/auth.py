from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Meeting, Series, Tag, User

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> User:
    uid = request.session.get("user_id")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated"
        )
    user = await session.get(User, uid)
    if user is None:
        request.session.clear()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated"
        )
    return user


async def claim_orphans(session: AsyncSession, user_id: str) -> None:
    """Backfill owner_id on rows that pre-date the multi-user migration.
    Only the FIRST registered user claims them; idempotent because subsequent
    users see no rows with owner_id IS NULL."""
    for model in (Meeting, Series, Tag):
        await session.execute(
            update(model).where(model.owner_id.is_(None)).values(owner_id=user_id)
        )


async def is_first_user(session: AsyncSession) -> bool:
    count = await session.scalar(select(func.count(User.id)))
    return (count or 0) == 0
