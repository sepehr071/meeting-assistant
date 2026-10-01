from __future__ import annotations

from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import claim_orphans, get_current_user, is_first_user
from app.config import settings
from app.db import get_session
from app.models import User
from app.schemas import UserRead
from app.services.oidc import oauth, oidc_configured

router = APIRouter()


# ── Keycloak / OIDC (BFF) ────────────────────────────────────────────────────
# Auth is Keycloak-only. The login/callback/logout endpoints are full-page
# browser navigations (302s), NOT XHR — so CORS does not apply to them. On
# callback the user is provisioned/looked-up by the OIDC `sub` and `user_id`
# is written into the existing signed session cookie; every data route keeps
# reading it via `get_current_user` (unchanged).


@router.get("/oidc/login")
async def oidc_login(request: Request):
    """Kick off the Authorization Code + PKCE flow → 302 to Keycloak."""
    if not oidc_configured():
        raise HTTPException(status_code=503, detail="OIDC is not configured")
    return await oauth.keycloak.authorize_redirect(request, settings.OIDC_REDIRECT_URI)


def _pick_username(info: dict) -> str:
    for key in ("preferred_username", "email", "name", "sub"):
        val = info.get(key)
        if val and str(val).strip():
            return str(val).strip()
    return "user"


async def _provision_user(session: AsyncSession, info: dict) -> User:
    """Look up the local user by OIDC `sub`; create one on first sight.

    Decision: fresh/separate accounts — no linking to legacy local rows. The
    `username` is a display label only (identity is `oidc_sub`); on collision
    with the unique constraint we append a short `sub` suffix.
    """
    sub = info.get("sub")
    if not sub:
        raise HTTPException(status_code=400, detail="OIDC token missing sub")
    sub = str(sub)

    user = (
        await session.execute(select(User).where(User.oidc_sub == sub))
    ).scalar_one_or_none()
    if user is not None:
        return user

    first = await is_first_user(session)

    username = _pick_username(info)
    collision = (
        await session.execute(select(User).where(User.username == username))
    ).scalar_one_or_none()
    if collision is not None:
        username = f"{username}-{sub[:8]}"

    user = User(
        oidc_sub=sub,
        username=username,
        email=info.get("email"),
        password_hash=None,
    )
    session.add(user)
    await session.flush()

    if first:
        await claim_orphans(session, user.id)

    await session.commit()
    await session.refresh(user)
    return user


@router.get("/oidc/callback")
async def oidc_callback(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Keycloak redirect target: exchange the code, provision the user, set the
    session cookie, then 302 to the frontend."""
    token = await oauth.keycloak.authorize_access_token(request)
    info = token.get("userinfo")
    if not info:
        info = await oauth.keycloak.userinfo(token=token)

    user = await _provision_user(session, dict(info))

    request.session["user_id"] = user.id
    id_token = token.get("id_token")
    if id_token:
        # Kept for RP-initiated logout (id_token_hint).
        request.session["id_token"] = id_token

    return RedirectResponse(
        settings.OIDC_POST_LOGIN_REDIRECT, status_code=status.HTTP_302_FOUND
    )


@router.get("/logout")
async def logout(request: Request):
    """RP-initiated logout: clear the local session, then 302 to Keycloak's
    end-session endpoint (kills the SSO session, returns to the post-logout
    URL). Degrades to a plain redirect when OIDC is unconfigured, no id_token
    is present, or discovery is unreachable."""
    id_token = request.session.get("id_token")
    request.session.clear()

    end_session = None
    if oidc_configured():
        try:
            meta = await oauth.keycloak.load_server_metadata()
            end_session = meta.get("end_session_endpoint")
        except Exception:
            end_session = None

    if end_session and id_token:
        params = {
            "id_token_hint": id_token,
            "post_logout_redirect_uri": settings.OIDC_POST_LOGOUT_REDIRECT,
        }
        return RedirectResponse(
            f"{end_session}?{urlencode(params)}", status_code=status.HTTP_302_FOUND
        )

    return RedirectResponse(
        settings.OIDC_POST_LOGOUT_REDIRECT, status_code=status.HTTP_302_FOUND
    )


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(user)
