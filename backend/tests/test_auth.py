from __future__ import annotations

from sqlalchemy import select

from tests.test_pipeline_e2e import _patch_pipeline_externals, _poll_status, _upload


async def test_register_login_logout_flow(unauth_client):
    # Register
    r = await unauth_client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "secret123"},
    )
    assert r.status_code == 201, r.text
    me = r.json()
    assert me["username"] == "alice"
    assert "id" in me
    assert "password_hash" not in me

    # /me works because cookie is in jar
    r = await unauth_client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["username"] == "alice"

    # Logout clears session
    r = await unauth_client.post("/api/auth/logout")
    assert r.status_code == 204

    r = await unauth_client.get("/api/auth/me")
    assert r.status_code == 401

    # Re-login same creds
    r = await unauth_client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "secret123"},
    )
    assert r.status_code == 200
    assert r.json()["username"] == "alice"

    # Wrong password
    await unauth_client.post("/api/auth/logout")
    r = await unauth_client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "WRONG"},
    )
    assert r.status_code == 401

    # Duplicate username
    r = await unauth_client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "different123"},
    )
    assert r.status_code == 409


async def test_protected_endpoints_reject_anonymous(unauth_client):
    r = await unauth_client.get("/api/meetings")
    assert r.status_code == 401
    r = await unauth_client.get("/api/series")
    assert r.status_code == 401
    r = await unauth_client.get("/api/tags")
    assert r.status_code == 401
    r = await unauth_client.get("/api/stats")
    assert r.status_code == 401


async def test_first_user_claims_orphan_meetings(
    unauth_client, sample_webm_bytes, mocker, apply_test_settings
):
    """Seed orphan rows (owner_id IS NULL) directly in the DB, then register
    the first user. claim_orphans should assign them to that user."""
    _patch_pipeline_externals(mocker)
    from app.models import Meeting, MeetingStatus, Series, Tag

    SessionLocal = apply_test_settings
    async with SessionLocal() as session:
        m = Meeting(
            id="orphan-meeting-1",
            title="legacy",
            status=MeetingStatus.UPLOADED,
            original_filename="o.webm",
            audio_path="/nowhere",
        )
        s = Series(name="Legacy Series")
        t = Tag(name="legacy-tag")
        session.add_all([m, s, t])
        await session.commit()

    r = await unauth_client.post(
        "/api/auth/register",
        json={"username": "first", "password": "firstpass123"},
    )
    assert r.status_code == 201
    user_id = r.json()["id"]

    async with SessionLocal() as session:
        rows = (await session.execute(select(Meeting))).scalars().all()
        assert all(row.owner_id == user_id for row in rows)
        srows = (await session.execute(select(Series))).scalars().all()
        assert all(row.owner_id == user_id for row in srows)
        trows = (await session.execute(select(Tag))).scalars().all()
        assert all(row.owner_id == user_id for row in trows)

    # First user can list their newly claimed meeting.
    listing = (await unauth_client.get("/api/meetings")).json()
    assert {m["id"] for m in listing} == {"orphan-meeting-1"}


async def test_other_user_cannot_read_my_meetings(
    client, second_client, sample_webm_bytes, mocker
):
    _patch_pipeline_externals(mocker)
    body = await _upload(client, sample_webm_bytes, title="alice-only")
    mid = body["id"]
    await _poll_status(client, mid, "done")

    # second user lists meetings — empty
    listing = (await second_client.get("/api/meetings")).json()
    assert listing == []

    # second user direct GET — 404 (do not leak existence)
    r = await second_client.get(f"/api/meetings/{mid}")
    assert r.status_code == 404

    # second user transcript / summary / chat / cancel — all 404
    assert (await second_client.get(f"/api/meetings/{mid}/transcript")).status_code == 404
    assert (await second_client.get(f"/api/meetings/{mid}/summary")).status_code == 404
    assert (await second_client.get(f"/api/meetings/{mid}/chat/messages")).status_code == 404
    assert (await second_client.post(f"/api/meetings/{mid}/cancel")).status_code == 404

    # owner can still read their meeting
    assert (await client.get(f"/api/meetings/{mid}")).status_code == 200


async def test_series_and_tags_isolated_per_user(client, second_client):
    s1 = (await client.post("/api/series", json={"name": "Shared Name"})).json()
    t1 = (await client.post("/api/tags", json={"name": "shared"})).json()

    # Same names succeed for second user (per-user uniqueness).
    s2 = (await second_client.post("/api/series", json={"name": "Shared Name"})).json()
    t2 = (await second_client.post("/api/tags", json={"name": "shared"})).json()
    assert s1["id"] != s2["id"]
    assert t1["id"] != t2["id"]

    # Lists are isolated.
    own_series = (await client.get("/api/series")).json()
    other_series = (await second_client.get("/api/series")).json()
    assert {x["id"] for x in own_series} == {s1["id"]}
    assert {x["id"] for x in other_series} == {s2["id"]}

    # Cross-user PATCH/DELETE on series → 404.
    assert (await second_client.delete(f"/api/series/{s1['id']}")).status_code == 404
    assert (
        await second_client.patch(f"/api/series/{s1['id']}", json={"name": "x"})
    ).status_code == 404
    assert (await second_client.delete(f"/api/tags/{t1['id']}")).status_code == 404
