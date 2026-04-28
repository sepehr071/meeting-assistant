from __future__ import annotations


async def test_create_list_update_delete_series(client):
    r = await client.post("/api/series", json={"name": "Weekly 1:1", "email_tone": "formal"})
    assert r.status_code == 201
    sid = r.json()["id"]

    r = await client.post("/api/series", json={"name": "Weekly 1:1"})
    assert r.status_code == 409

    r = await client.get("/api/series")
    assert r.status_code == 200
    assert r.json()[0]["meeting_count"] == 0

    r = await client.patch(f"/api/series/{sid}", json={"email_tone": "casual"})
    assert r.status_code == 200
    assert r.json()["email_tone"] == "casual"

    r = await client.delete(f"/api/series/{sid}")
    assert r.status_code == 204
    r = await client.get("/api/series")
    assert r.json() == []


async def test_keyterms_crud(client):
    r = await client.post("/api/series", json={"name": "Sales"})
    sid = r.json()["id"]

    r = await client.post(f"/api/series/{sid}/keyterms", json={"term": "MeetGPT"})
    assert r.status_code == 201
    tid = r.json()["id"]
    assert r.json()["source"] == "manual"

    r = await client.post(f"/api/series/{sid}/keyterms", json={"term": "x"})
    assert r.status_code == 400

    r = await client.get(f"/api/series/{sid}/keyterms")
    assert len(r.json()) == 1

    r = await client.delete(f"/api/series/{sid}/keyterms/{tid}")
    assert r.status_code == 204
    r = await client.get(f"/api/series/{sid}/keyterms")
    assert r.json() == []


async def test_accept_keyterm_promotes_suggested(client, apply_test_settings):
    from app.models import Series
    from app.services import glossary

    async with apply_test_settings() as session:
        s = Series(name="Eng Sync")
        session.add(s)
        await session.commit()
        sid = s.id

    async with apply_test_settings() as session:
        await glossary.add_suggested_terms(session, sid, ["AlphaProduct"])

    r = await client.get(f"/api/series/{sid}/keyterms?source=suggested")
    items = r.json()
    assert len(items) == 1
    tid = items[0]["id"]

    r = await client.post(f"/api/series/{sid}/keyterms/{tid}/accept")
    assert r.status_code == 200
    assert r.json()["source"] == "accepted"


async def test_speaker_names_endpoint(client, apply_test_settings):
    from app.models import Series
    from app.services import glossary

    async with apply_test_settings() as session:
        s = Series(name="Standup")
        session.add(s)
        await session.commit()
        sid = s.id

    async with apply_test_settings() as session:
        await glossary.upsert_speaker_name(session, sid, "Ali")
        await glossary.upsert_speaker_name(session, sid, "Sara")

    r = await client.get(f"/api/series/{sid}/speaker-names")
    assert r.status_code == 200
    assert set(r.json()) == {"Ali", "Sara"}


async def test_tags_crud(client):
    r = await client.post("/api/tags", json={"name": "hiring"})
    assert r.status_code == 201
    tid = r.json()["id"]

    r = await client.post("/api/tags", json={"name": "hiring"})
    assert r.status_code == 201  # idempotent
    assert r.json()["id"] == tid

    r = await client.get("/api/tags")
    assert len(r.json()) == 1

    r = await client.delete(f"/api/tags/{tid}")
    assert r.status_code == 204
    assert (await client.get("/api/tags")).json() == []
