from __future__ import annotations

from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


@pytest.fixture
def tmp_db_url(tmp_path: Path) -> str:
    db_file = tmp_path / "test.db"
    return f"sqlite+aiosqlite:///{db_file.as_posix()}"


@pytest_asyncio.fixture(autouse=True)
async def apply_test_settings(monkeypatch, tmp_db_url: str, tmp_path: Path):
    """Override DATABASE_URL + STORAGE_DIR, rebind app.db engine/SessionLocal,
    and create all tables in the fresh sqlite file."""
    import app.config as cfgmod
    import app.db as dbmod
    from app.db import Base

    storage_dir = tmp_path / "storage"
    audio_dir = storage_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(cfgmod.settings, "DATABASE_URL", tmp_db_url)
    monkeypatch.setattr(cfgmod.settings, "STORAGE_DIR", storage_dir)

    new_engine = create_async_engine(tmp_db_url, future=True)
    new_sessionmaker = async_sessionmaker(
        new_engine, expire_on_commit=False, class_=AsyncSession
    )
    monkeypatch.setattr(dbmod, "engine", new_engine)
    monkeypatch.setattr(dbmod, "SessionLocal", new_sessionmaker)

    # Import models so all tables are registered on Base.metadata.
    import app.models  # noqa: F401

    # Modules that did `from app.db import SessionLocal` at module load time
    # hold their own bound reference; rebind them too so background tasks
    # write to the test database.
    import app.services.pipeline as pipelinemod
    monkeypatch.setattr(pipelinemod, "SessionLocal", new_sessionmaker)

    async with new_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield new_sessionmaker

    await new_engine.dispose()


@pytest_asyncio.fixture
async def unauth_client(apply_test_settings):
    """Raw client with no session — for testing auth boundaries directly."""
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def client(apply_test_settings):
    """Pre-authenticated client. Registers the default test user (which makes
    that user the FIRST user — so claim_orphans assigns any pre-existing rows
    to them) and keeps the session cookie in the jar for all subsequent
    requests."""
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/auth/register",
            json={"username": "testuser", "password": "testpass123"},
        )
        assert resp.status_code == 201, resp.text
        yield ac


@pytest_asyncio.fixture
async def second_client(apply_test_settings):
    """Second pre-authenticated client (different user) for cross-user
    isolation tests. Use AFTER `client` so this user is not the first."""
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/auth/register",
            json={"username": "otheruser", "password": "otherpass123"},
        )
        assert resp.status_code == 201, resp.text
        yield ac


@pytest.fixture
def sample_webm_bytes() -> bytes:
    # Content irrelevant — transcription is mocked.
    return b"WEBM_FAKE_AUDIO\x00" * 100


@pytest_asyncio.fixture
async def default_user_id(client) -> str:
    """ID of the default `client` fixture's user. Useful for seeding owned
    rows directly via the DB (bypassing API)."""
    r = await client.get("/api/auth/me")
    assert r.status_code == 200
    return r.json()["id"]
