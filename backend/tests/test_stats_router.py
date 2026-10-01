from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models import Meeting, MeetingStatus, Summary


async def test_stats_anonymous_rejected(unauth_client):
    r = await unauth_client.get("/api/stats")
    assert r.status_code == 401


async def test_stats_empty_zeros(client):
    r = await client.get("/api/stats")
    assert r.status_code == 200
    body = r.json()
    assert body["days"] == 7
    assert body["meetings"] == 0
    assert body["meetings_delta"] == 0
    assert body["duration_s"] == 0
    assert body["duration_delta_s"] == 0
    assert body["actions"] == 0
    assert body["decisions"] == 0


async def test_stats_days_param_validation(client):
    assert (await client.get("/api/stats?days=0")).status_code == 422
    assert (await client.get("/api/stats?days=-1")).status_code == 422
    assert (await client.get("/api/stats?days=400")).status_code == 422
    assert (await client.get("/api/stats?days=365")).status_code == 200


async def test_stats_aggregates_current_window_only(client, apply_test_settings, default_user_id):
    """Meetings inside `since..now` count; meetings before `since` don't.
    Only DONE-status meetings count. Action + decision counts come from latest Summary."""
    SessionLocal = apply_test_settings
    now = datetime.now(timezone.utc)

    async with SessionLocal() as s:
        # Inside window (yesterday): 2 done meetings
        for i, dur in enumerate([60.0, 120.0]):
            m = Meeting(
                id=f"in-{i}",
                title=f"in-{i}",
                status=MeetingStatus.DONE,
                original_filename="x.webm",
                audio_path="/x",
                owner_id=default_user_id,
                duration_s=dur,
            )
            m.created_at = now - timedelta(days=1)
            s.add(m)
            s.add(
                Summary(
                    meeting_id=m.id,
                    exec_summary="e",
                    action_items_json=[{"text": "a1"}, {"text": "a2"}],
                    decisions_json=["d1"],
                    minutes_json=[],
                    model="m",
                )
            )

        # Outside (older): should not count in current window
        m_old = Meeting(
            id="old-1",
            title="old",
            status=MeetingStatus.DONE,
            original_filename="x.webm",
            audio_path="/x",
            owner_id=default_user_id,
            duration_s=999.0,
        )
        m_old.created_at = now - timedelta(days=30)
        s.add(m_old)
        s.add(
            Summary(
                meeting_id="old-1",
                exec_summary="e",
                action_items_json=[{"text": "x"}],
                decisions_json=[],
                minutes_json=[],
                model="m",
            )
        )

        # Not-done in window: should NOT count
        m_pending = Meeting(
            id="pending-1",
            title="p",
            status=MeetingStatus.TRANSCRIBING,
            original_filename="x.webm",
            audio_path="/x",
            owner_id=default_user_id,
            duration_s=50.0,
        )
        m_pending.created_at = now - timedelta(hours=1)
        s.add(m_pending)

        await s.commit()

    r = await client.get("/api/stats?days=7")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["meetings"] == 2
    assert body["duration_s"] == 180  # int(60+120)
    assert body["actions"] == 4       # 2 per meeting × 2 meetings
    assert body["decisions"] == 2     # 1 per meeting × 2 meetings


async def test_stats_delta_against_prior_window(client, apply_test_settings, default_user_id):
    """meetings_delta = current - prior window of same length."""
    SessionLocal = apply_test_settings
    now = datetime.now(timezone.utc)

    async with SessionLocal() as s:
        # Current window (last 7d): 3 meetings
        for i in range(3):
            m = Meeting(
                id=f"cur-{i}",
                title=f"cur-{i}",
                status=MeetingStatus.DONE,
                original_filename="x.webm",
                audio_path="/x",
                owner_id=default_user_id,
                duration_s=100.0,
            )
            m.created_at = now - timedelta(days=2)
            s.add(m)
            s.add(
                Summary(
                    meeting_id=m.id,
                    exec_summary="e",
                    action_items_json=[],
                    decisions_json=[],
                    minutes_json=[],
                    model="m",
                )
            )

        # Prior window (7..14d ago): 1 meeting
        m = Meeting(
            id="prev-1",
            title="prev",
            status=MeetingStatus.DONE,
            original_filename="x.webm",
            audio_path="/x",
            owner_id=default_user_id,
            duration_s=40.0,
        )
        m.created_at = now - timedelta(days=10)
        s.add(m)
        s.add(
            Summary(
                meeting_id="prev-1",
                exec_summary="e",
                action_items_json=[],
                decisions_json=[],
                minutes_json=[],
                model="m",
            )
        )
        await s.commit()

    r = await client.get("/api/stats?days=7")
    body = r.json()
    assert body["meetings"] == 3
    assert body["meetings_delta"] == 3 - 1
    assert body["duration_s"] == 300
    assert body["duration_delta_s"] == 300 - 40


async def test_stats_isolated_per_owner(client, second_client, apply_test_settings, default_user_id):
    """User A's meetings must not leak into user B's stats."""
    SessionLocal = apply_test_settings
    now = datetime.now(timezone.utc)

    # Seed 2 DONE meetings owned by user A.
    async with SessionLocal() as s:
        for i in range(2):
            m = Meeting(
                id=f"a-{i}",
                title=f"a-{i}",
                status=MeetingStatus.DONE,
                original_filename="x.webm",
                audio_path="/x",
                owner_id=default_user_id,
                duration_s=10.0,
            )
            m.created_at = now - timedelta(hours=1)
            s.add(m)
            s.add(
                Summary(
                    meeting_id=m.id,
                    exec_summary="e",
                    action_items_json=[],
                    decisions_json=[],
                    minutes_json=[],
                    model="m",
                )
            )
        await s.commit()

    a_body = (await client.get("/api/stats")).json()
    b_body = (await second_client.get("/api/stats")).json()

    assert a_body["meetings"] == 2
    assert b_body["meetings"] == 0
