from __future__ import annotations


from tests.test_pipeline_e2e import _patch_pipeline_externals, _poll_status, _upload


async def test_suggest_series_endpoint(client):
    await client.post("/api/series", json={"name": "Weekly 1:1 with Ali"})
    await client.post("/api/series", json={"name": "Q2 Planning"})

    r = await client.get("/api/meetings/suggest-series", params={"title": "Weekly 1:1 with Aly"})
    assert r.status_code == 200
    body = r.json()
    assert body is not None
    assert "Ali" in body["name"]
    assert body["score"] >= 85.0


async def test_suggest_series_returns_null_below_threshold(client):
    await client.post("/api/series", json={"name": "Weekly 1:1"})
    r = await client.get("/api/meetings/suggest-series", params={"title": "Random Standalone"})
    assert r.status_code == 200
    assert r.json() is None


async def test_upload_with_series_and_tags(client, sample_webm_bytes, mocker):
    _patch_pipeline_externals(mocker)
    s = (await client.post("/api/series", json={"name": "Eng Sync"})).json()
    t1 = (await client.post("/api/tags", json={"name": "hiring"})).json()
    t2 = (await client.post("/api/tags", json={"name": "infra"})).json()

    files = {"file": ("m.webm", sample_webm_bytes, "audio/webm")}
    data = {
        "title": "Sync",
        "series_id": s["id"],
        "tag_ids": [t1["id"], t2["id"]],
    }
    resp = await client.post("/api/meetings/upload", files=files, data=data)
    assert resp.status_code == 201, resp.text
    meeting = resp.json()
    assert meeting["series_id"] == s["id"]
    await _poll_status(client, meeting["id"], "done")

    detail = (await client.get(f"/api/meetings/{meeting['id']}")).json()
    assert detail["series"]["id"] == s["id"]
    tag_names = {t["name"] for t in detail["tags"]}
    assert tag_names == {"hiring", "infra"}


async def test_patch_meeting_updates_series_and_tags(client, sample_webm_bytes, mocker):
    _patch_pipeline_externals(mocker)
    body = await _upload(client, sample_webm_bytes)
    mid = body["id"]
    await _poll_status(client, mid, "done")

    s = (await client.post("/api/series", json={"name": "Sales"})).json()
    t = (await client.post("/api/tags", json={"name": "q3"})).json()

    r = await client.patch(
        f"/api/meetings/{mid}",
        json={"series_id": s["id"], "tag_ids": [t["id"]], "title": "Updated"},
    )
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["title"] == "Updated"
    assert detail["series"]["id"] == s["id"]
    assert [tg["id"] for tg in detail["tags"]] == [t["id"]]

    r = await client.patch(f"/api/meetings/{mid}", json={"series_id": ""})
    assert r.json()["series"] is None


async def test_speaker_rename_pushes_to_series_glossary(
    client, sample_webm_bytes, mocker
):
    _patch_pipeline_externals(mocker)
    s = (await client.post("/api/series", json={"name": "Standup"})).json()

    files = {"file": ("m.webm", sample_webm_bytes, "audio/webm")}
    data = {"title": "S", "series_id": s["id"]}
    resp = await client.post("/api/meetings/upload", files=files, data=data)
    mid = resp.json()["id"]
    await _poll_status(client, mid, "done")

    rename = await client.patch(
        f"/api/meetings/{mid}/speakers/speaker_0",
        json={"display_name": "Ali"},
    )
    assert rename.status_code == 200

    names = (await client.get(f"/api/series/{s['id']}/speaker-names")).json()
    assert "Ali" in names

    suggested = (
        await client.get(f"/api/series/{s['id']}/keyterms?source=suggested")
    ).json()
    assert any(item["term"] == "Ali" for item in suggested)


async def test_list_meetings_filter_by_series_and_tag(
    client, sample_webm_bytes, mocker
):
    _patch_pipeline_externals(mocker)

    s = (await client.post("/api/series", json={"name": "Filter Series"})).json()
    t = (await client.post("/api/tags", json={"name": "filter-tag"})).json()

    # m1: in series + tagged
    files = {"file": ("a.webm", sample_webm_bytes, "audio/webm")}
    data1 = {
        "title": "alpha",
        "series_id": s["id"],
        "tag_ids": [t["id"]],
    }
    m1 = (await client.post("/api/meetings/upload", files=files, data=data1)).json()

    # m2: standalone
    files2 = {"file": ("b.webm", sample_webm_bytes, "audio/webm")}
    m2 = (await client.post("/api/meetings/upload", files=files2, data={"title": "bravo"})).json()

    await _poll_status(client, m1["id"], "done")
    await _poll_status(client, m2["id"], "done")

    by_series = (await client.get(f"/api/meetings?series_id={s['id']}")).json()
    assert {m["id"] for m in by_series} == {m1["id"]}

    by_tag = (await client.get(f"/api/meetings?tag_ids={t['id']}")).json()
    assert {m["id"] for m in by_tag} == {m1["id"]}

    by_q = (await client.get("/api/meetings?q=brav")).json()
    assert {m["id"] for m in by_q} == {m2["id"]}


async def test_summary_exposes_new_fields(client, sample_webm_bytes, mocker):
    _patch_pipeline_externals(
        mocker,
        summarize_side_effect={
            "exec_summary": "خلاصه",
            "action_items": [],
            "decisions": [],
            "qa": [{"question": "Q1?", "answer": "A1"}, {"question": "Q2?", "answer": None}],
            "open_questions": [{"question": "Open?", "owner": "Ali"}],
            "email_draft": {"subject": "موضوع", "body": "متن ایمیل"},
        },
    )

    body = await _upload(client, sample_webm_bytes)
    mid = body["id"]
    await _poll_status(client, mid, "done")

    summary = (await client.get(f"/api/meetings/{mid}/summary")).json()
    assert len(summary["qa"]) == 2
    assert summary["qa"][1]["answer"] is None
    assert summary["open_questions"][0]["owner"] == "Ali"
    assert summary["email"]["subject"] == "موضوع"
    assert summary["email"]["body"] == "متن ایمیل"
    assert summary["email"]["tone"] == "formal"
