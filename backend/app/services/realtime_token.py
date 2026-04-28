from __future__ import annotations

import httpx

from app.config import settings

ELEVENLABS_REALTIME_TOKEN_URL = (
    "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe"
)


async def issue_realtime_token() -> dict:
    """Request a single-use ephemeral token from ElevenLabs.

    Returns a dict shaped like ``{"token": str, "expires_at": str | None}``.
    """
    headers = {"xi-api-key": settings.ELEVENLABS_API_KEY}
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(ELEVENLABS_REALTIME_TOKEN_URL, headers=headers)
        response.raise_for_status()
        data = response.json()

    if not isinstance(data, dict) or "token" not in data:
        raise RuntimeError(f"Unexpected token response: {data!r}")

    return data
