from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi import FastAPI

from app.config import settings
from app.services import realtime_token as realtime_token_module
from app.services.realtime_token import (
    ELEVENLABS_REALTIME_TOKEN_URL,
    issue_realtime_token,
)


def _mock_response(payload: dict[str, Any]) -> MagicMock:
    response = MagicMock(spec=httpx.Response)
    response.json = MagicMock(return_value=payload)
    response.raise_for_status = MagicMock(return_value=None)
    return response


async def test_issue_token_calls_upstream_with_key(
    monkeypatch: pytest.MonkeyPatch, mocker: Any
) -> None:
    monkeypatch.setattr(settings, "ELEVENLABS_API_KEY", "fake")

    body = {"token": "tok_abc", "expires_at": "2026-04-27T10:15:00Z"}
    post_mock = mocker.patch.object(
        httpx.AsyncClient,
        "post",
        new=AsyncMock(return_value=_mock_response(body)),
    )

    result = await issue_realtime_token()

    assert result == body
    post_mock.assert_awaited_once()
    args, kwargs = post_mock.call_args
    assert args[0] == ELEVENLABS_REALTIME_TOKEN_URL
    assert kwargs["headers"]["xi-api-key"] == "fake"


async def test_issue_token_raises_on_missing_token_key(
    monkeypatch: pytest.MonkeyPatch, mocker: Any
) -> None:
    monkeypatch.setattr(settings, "ELEVENLABS_API_KEY", "fake")

    mocker.patch.object(
        httpx.AsyncClient,
        "post",
        new=AsyncMock(return_value=_mock_response({"foo": "bar"})),
    )

    with pytest.raises(RuntimeError, match="Unexpected token response"):
        await issue_realtime_token()


async def test_router_returns_pydantic_model(mocker: Any) -> None:
    from app.auth import get_current_user
    from app.models import User
    from app.routers.realtime import router

    app = FastAPI()
    app.include_router(router, prefix="/api/realtime")

    fake_user = User(id="fake-user-id", username="fake", password_hash="x")
    app.dependency_overrides[get_current_user] = lambda: fake_user

    mocker.patch.object(
        realtime_token_module,
        "issue_realtime_token",
        new=AsyncMock(return_value={"token": "t1", "expires_at": None}),
    )
    # The router imports the function by name into its own module namespace,
    # so patch that binding too.
    from app.routers import realtime as realtime_router_module

    mocker.patch.object(
        realtime_router_module,
        "issue_realtime_token",
        new=AsyncMock(return_value={"token": "t1", "expires_at": None}),
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/realtime/token")

    assert response.status_code == 200
    payload = response.json()
    assert payload == {"token": "t1", "expires_at": None, "keyterms": []}


async def test_router_returns_keyterms_for_series(client, mocker: Any) -> None:
    from app.routers import realtime as realtime_router_module

    mocker.patch.object(
        realtime_router_module,
        "issue_realtime_token",
        new=AsyncMock(return_value={"token": "t2", "expires_at": None}),
    )

    s = (await client.post("/api/series", json={"name": "Live"})).json()
    await client.post(f"/api/series/{s['id']}/keyterms", json={"term": "Alpha"})
    await client.post(f"/api/series/{s['id']}/keyterms", json={"term": "Beta"})

    r = await client.post("/api/realtime/token", json={"series_id": s["id"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["token"] == "t2"
    assert set(body["keyterms"]) == {"Alpha", "Beta"}
