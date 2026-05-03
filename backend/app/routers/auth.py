from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    claim_orphans,
    get_current_user,
    hash_password,
    is_first_user,
    verify_password,
)
from app.db import get_session
from app.models import User
from app.schemas import UserLogin, UserRead, UserRegister

router = APIRouter()


def _normalize_username(raw: str) -> str:
    return raw.strip().lower()


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(
    body: UserRegister,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> UserRead:
    username = _normalize_username(body.username)
    if not username:
        raise HTTPException(status_code=400, detail="username required")

    existing = (
        await session.execute(select(User).where(User.username == username))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="username already taken")

    first = await is_first_user(session)

    user = User(username=username, password_hash=hash_password(body.password))
    session.add(user)
    await session.flush()

    if first:
        await claim_orphans(session, user.id)

    await session.commit()
    await session.refresh(user)

    request.session["user_id"] = user.id
    return UserRead.model_validate(user)


@router.post("/login", response_model=UserRead)
async def login(
    body: UserLogin,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> UserRead:
    username = _normalize_username(body.username)
    user = (
        await session.execute(select(User).where(User.username == username))
    ).scalar_one_or_none()
    if user is None or not verify_password(user.password_hash, body.password):
        raise HTTPException(status_code=401, detail="invalid credentials")

    request.session["user_id"] = user.id
    return UserRead.model_validate(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request) -> None:
    request.session.clear()


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(user)
