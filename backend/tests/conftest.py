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
    import app.ratelimit as rlmod
    from app.db import Base, apply_sqlite_pragmas

    storage_dir = tmp_path / "storage"
    audio_dir = storage_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(cfgmod.settings, "DATABASE_URL", tmp_db_url)
    monkeypatch.setattr(cfgmod.settings, "STORAGE_DIR", storage_dir)

    # Keep the limiter from leaking in-memory counts across the suite; the
    # dedicated rate-limit test re-enables it locally.
    monkeypatch.setattr(rlmod.limiter, "enabled", False)

    new_engine = create_async_engine(tmp_db_url, future=True)
    apply_sqlite_pragmas(new_engine)
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


@pytest.fixture
def login_via_oidc(monkeypatch):
    """Authenticate a client through the Keycloak BFF callback without a real
    Keycloak: monkeypatch `authorize_access_token` to return a fixed userinfo,
    hit GET /api/auth/oidc/callback (302), and let the session cookie land in
    the client's jar. Works for concurrent clients (each call re-patches before
    its own callback; thereafter requests authenticate via the stored cookie).
    """

    async def _do(ac, *, sub: str, username: str, email: str | None = None):
        import app.services.oidc as oidcmod

        async def _fake_authorize_access_token(request):
            return {
                "userinfo": {
                    "sub": sub,
                    "preferred_username": username,
                    "email": email,
                },
                "id_token": f"fake-id-token-{sub}",
            }

        monkeypatch.setattr(
            oidcmod.oauth.keycloak,
            "authorize_access_token",
            _fake_authorize_access_token,
        )
        resp = await ac.get("/api/auth/oidc/callback")
        assert resp.status_code in (302, 307), resp.text
        return resp

    return _do


@pytest_asyncio.fixture
async def client(apply_test_settings, login_via_oidc):
    """Pre-authenticated client. Logs in the default test user via OIDC (which
    makes that user the FIRST user — so claim_orphans assigns any pre-existing
    rows to them) and keeps the session cookie in the jar for all subsequent
    requests."""
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await login_via_oidc(
            ac, sub="oidc-testuser", username="testuser", email="testuser@example.com"
        )
        yield ac


@pytest_asyncio.fixture
async def second_client(apply_test_settings, login_via_oidc):
    """Second pre-authenticated client (different user) for cross-user
    isolation tests. Use AFTER `client` so this user is not the first."""
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await login_via_oidc(
            ac, sub="oidc-otheruser", username="otheruser", email="otheruser@example.com"
        )
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
