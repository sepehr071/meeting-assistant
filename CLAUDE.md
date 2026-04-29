# Meeting Assistant — Project Guide

Persian (Farsi) AI meeting assistant. FastAPI backend + Next.js frontend. Three ingest modes: (1) upload an existing recording, (2) live-record from mic in browser, (3) live-record another tab's audio via `getDisplayMedia` (works for Google Meet / Zoom Web / Teams Web). All live modes run simultaneous (a) realtime captions via Scribe v2 Realtime WebSocket and (b) batch diarization via Scribe v2 on stop. Summarized into 7 artifacts (exec summary, action items, decisions, speaker-attributed minutes, Q&A, open questions, follow-up email draft) by Google Gemini 3 Flash Preview through OpenRouter. Recurring meetings group into series (with shared glossary + speaker-name memory + email-tone preference); free-form tags add cross-cutting organization.

Single user. Local SQLite. No auth. Hardcoded model id via `.env`.

## Stack

- **Backend:** Python 3.12, `uv`, FastAPI, SQLAlchemy 2.0 async, `aiosqlite`, Alembic, `httpx`, ElevenLabs SDK, `rapidfuzz`, pydantic-settings.
- **Frontend:** Next.js 16 (App Router, Turbopack), TypeScript, Tailwind 4, shadcn/ui, TanStack Query v5, react-dropzone, Vazirmatn font, sonner toasts.
- **External:** ElevenLabs Scribe v2 (batch + realtime), OpenRouter (`google/gemini-3-flash-preview` with `response_format: json_schema strict`).

## Layout

```
backend/
├── app/
│   ├── main.py             # FastAPI + CORS + lifespan; mounts routers
│   ├── config.py           # pydantic-settings, reads .env
│   ├── db.py               # async engine + SessionLocal
│   ├── models.py           # Meeting, Transcript, Summary, Speaker, Series, Tag, MeetingTag, SeriesKeyterm, SeriesSpeakerName
│   ├── schemas.py          # Pydantic IO (MeetingRead, SummaryRead, SeriesRead, TagRead, KeyTermRead, …)
│   ├── routers/
│   │   ├── meetings.py     # /api/meetings/* (upload, list w/ filters, detail, PATCH, suggest-series, transcript, summary, speakers, regenerate, SSE stream)
│   │   ├── realtime.py     # /api/realtime/token (ephemeral token + per-series keyterms)
│   │   ├── series.py       # /api/series/* + /keyterms (manual/suggested/accepted) + /speaker-names
│   │   └── tags.py         # /api/tags/*
│   ├── services/
│   │   ├── storage.py      # save_audio, ffprobe duration
│   │   ├── transcription.py# Scribe v2 batch wrapper (sync + async-thread); accepts keyterms
│   │   ├── realtime_token.py # ElevenLabs single-use-token proxy
│   │   ├── glossary.py     # series keyterm CRUD + speaker-name memory + correction-diff extraction (accepts session: AsyncSession)
│   │   ├── series_match.py # rapidfuzz token_sort_ratio fuzzy series suggester (threshold 85)
│   │   ├── summarizer.py   # OpenRouter call + JSON_SCHEMA + streaming + email_tone fragment
│   │   └── pipeline.py     # state-machine orchestrator (loads series_id → keyterms + tone)
│   └── prompts/summary_system.txt
├── alembic/                # migrations
├── storage/audio/          # uploaded blobs (UUID-named)
├── tests/                  # pytest + pytest-asyncio (auto mode)
└── pyproject.toml          # uv-managed; tool.pyright, tool.pytest

frontend/
├── app/
│   ├── layout.tsx          # html dir="rtl", Vazirmatn, providers, sonner
│   ├── providers.tsx       # QueryClientProvider
│   ├── page.tsx            # list + filters (series, tags, q) + UploadSection
│   ├── series/page.tsx     # series + glossary management
│   ├── tags/page.tsx       # tag CRUD
│   └── meetings/[id]/page.tsx  # 8-tab detail view
├── components/
│   ├── ui/                 # shadcn (button, card, tabs, …)
│   ├── upload-section.tsx  # title, num_speakers, brief, series picker, fuzzy suggest, tag chips, dropzone, recorder
│   ├── dropzone.tsx
│   ├── recorder.tsx        # tee mic → MediaRecorder + AudioWorklet WS; accepts seriesId/tagIds
│   ├── tab-recorder.tsx    # getDisplayMedia tab capture (+ optional mic mix) → same Scribe + upload pipeline
│   ├── live-captions.tsx
│   ├── meeting-status.tsx  # polled status badge
│   ├── summary-view.tsx
│   ├── action-items-view.tsx
│   ├── decisions-view.tsx
│   ├── qa-view.tsx                # Q&A list (with null-answer rendering)
│   ├── open-questions-view.tsx    # parking-lot items
│   ├── email-draft-view.tsx       # subject + body + tone label + copy button
│   ├── minutes-view.tsx    # speaker rename popover; pulls known names from series
│   ├── series-manager.tsx  # used by /series page
│   ├── tag-manager.tsx     # used by /tags page
│   └── transcript-view.tsx
└── lib/
    ├── api.ts              # typed fetch client (Series, Tag, KeyTerm, …)
    ├── rtl.ts              # isPersian, formatJalali
    ├── scribe-realtime.ts  # WebSocket client; appends keyterms (50×20chars) as URL params
    └── pcm-worklet.ts      # AudioWorklet source string + base64 helper
```

## Run

```bash
# 1. backend (port 8000)
cd backend
uv run alembic upgrade head     # apply migrations after pulling
uv run uvicorn app.main:app --port 8000

# 2. frontend (port 3000)
cd frontend
pnpm dev
```

`.env` (in `backend/`):

```
ELEVENLABS_API_KEY=...   # needs scribe_v2 + scribe_v2_realtime + single-use-token
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=google/gemini-3-flash-preview
OPENROUTER_REFERER=http://localhost:3000
OPENROUTER_TITLE=Meeting Assistant
STORAGE_DIR=./storage
DATABASE_URL=sqlite+aiosqlite:///./meeting.db
ALLOWED_ORIGIN=http://localhost:3000
# ALLOWED_ORIGIN_REGEX=^http://localhost:3000$  # only set to override the default
```

## Tests

```bash
cd backend
uv run pytest -v
```

Currently 40 passed + 1 skipped (live Scribe smoke needs `tests/fixtures/sample_fa.mp3` + real `ELEVENLABS_API_KEY`).

```bash
cd frontend
pnpm exec tsc --noEmit
```

No frontend unit tests. UI verified manually.

## Architecture rules

### State machine

`Meeting.status`: `uploaded → transcribing → summarizing → done` (or `failed` with traceback in `error_message`).

Pipeline runs as `BackgroundTasks` from upload endpoint. Idempotent — re-running on a `done` meeting is a no-op.

### Hybrid live mode

Browser tees one mic stream:
1. `MediaRecorder` → WebM/Opus blob held in memory.
2. `AudioWorklet` downsamples 48k float32 → 16k int16 PCM → base64 → WebSocket to `scribe_v2_realtime` for live captions.

On stop: WS closes, blob uploads to `/api/meetings/upload` for batch `scribe_v2` with `diarize=True`. Live captions are display-only and discarded.

**`scribe_v2_realtime` has NO diarization** — that's why we run batch on stop. Confirmed with ElevenLabs docs.

### Realtime config goes via URL query params, not as a client message

Client→server messages on `scribe_v2_realtime` WS are limited to `input_audio_chunk`. Sending `session_config` returns `input_error: "Unexpected message type: session_config"`. All config (`model_id`, `language_code`, `commit_strategy`, `vad_silence_threshold_secs`, `include_timestamps`) is set as URL query params on connect. See `lib/scribe-realtime.ts`.

### Ephemeral token flow

API key never reaches the browser. Frontend calls `POST /api/realtime/token` → backend proxies to `https://api.elevenlabs.io/v1/single-use-token/realtime_scribe` with `xi-api-key` → returns `{token, expires_at}` (~15 min, single use). Browser passes `?token=` on the WebSocket URL.

### Structured outputs

OpenRouter call uses `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`. The schema is in `app/services/summarizer.py::JSON_SCHEMA` (do not duplicate elsewhere). `summarize()` validates returned JSON via `jsonschema.validate` before returning — `ValueError` on mismatch.

`_body()` pins `temperature=0.2` + `reasoning={"effort": "minimal", "exclude": True}`. Low temperature stabilizes `speaker_names` mapping; minimal reasoning is the latency lever for 1h+ meetings (Gemini 3 Flash Preview default reasoning was the bottleneck). `exclude: True` strips reasoning tokens from the response payload (we don't render them).

`minutes` is **NOT** in `JSON_SCHEMA`. The LLM no longer generates the verbatim turn-by-turn record — `pipeline.build_minutes_segments(words)` produces it server-side from `Transcript.words_json` and the pipeline injects it via `data["minutes"] = ...` before `_persist_summary`. Reason: long meetings used to truncate when the LLM hit its output-token ceiling. Server-side minutes are deterministic, complete, and free up output budget for the high-signal LLM fields.

### Summarizer context injection

`summarize(prompt, *, context=None, email_tone='formal')` and `summarize_stream(...)`. Tone fragment (`Email tone: FORMAL.` or `Email tone: CASUAL.`) is always injected as the second system message; `context` (if set) becomes a third system message. Diarized transcript stays clean in the user message. Pipeline pulls `email_tone` from `Meeting.series.email_tone` (formal default if no series).

### Series, tags, glossary

Recurring meetings → bind to `Series` (single FK on `Meeting`, optional). Series carries `email_tone` + glossary (`SeriesKeyterm` rows: `manual`/`suggested`/`accepted`) + speaker-name memory (`SeriesSpeakerName`, suggest-only — no voice embeddings in Scribe v2). Standalone meetings have no glossary fed to Scribe.

Glossary feeds Scribe `keyterms` for both batch (1000 × 50chars cap) and realtime (50 × 20chars cap as URL params; +20% billing surcharge). Caps and validation in `app/services/glossary.py::_is_valid_keyterm`.

Speaker rename in `meetings.py::rename_speaker` auto-pushes display_name into `series_speaker_names` AND adds it as a suggested keyterm — user accepts/rejects in `/series` UI.

LLM speaker auto-assign runs in `services/speakers.py::apply_speaker_names`, called from the pipeline after `summarize()` (both `run_pipeline` and `regenerate_summary`). It reads the LLM's `speaker_names` array and writes `Speaker.display_name`, **skipping speakers that already have a non-empty `display_name`** (preserves manual edits) and syncing into the series glossary the same way `rename_speaker` does. Don't change the skip semantics — manual edits must always win over LLM re-runs.

Speaker mapping signals are in `prompts/summary_system.txt::SPEAKER MAPPING`: (1) self-introduction inside the speaker's own line, (2) address-by-name in segment N + direct reply in N+1, (3) name from `meeting_brief` matched by role/content. Brief is preferred for spelling but **not required** — speakers without a brief still get mapped if (1) or (2) fires confidently. Don't re-gate this on brief presence.

Tags are flat M:N labels (`Tag` + `MeetingTag`). Independent of series. Used for cross-cutting filters on the home page.

### Tab capture from web app (`getDisplayMedia`)

`frontend/components/tab-recorder.tsx` calls `navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })` → user picks a tab in the browser's system dialog → user MUST tick "Share tab audio" (browser-level checkbox; if missed, no audio track and we surface error). Video tracks are stopped immediately; only the audio track feeds the same `AudioContext` mixer used by `recorder.tsx`. Optional mic mix (default on) goes through `getUserMedia` and joins via a `MediaStreamDestination`. Auto-stops on the audio track's `ended` event when the user clicks the browser's "Stop sharing" bar.

Cross-browser: Chrome / Edge solid; Firefox tab-audio support partial.

### Tunable Scribe params (per meeting)

Stored on `Meeting` row, set via upload form:

- `num_speakers: int | None` — caps Scribe diarization clusters (1-32). Blank = model auto-detect.
- `meeting_brief: str | None` — free-text context. Fed to LLM only, not Scribe.

Always-on at the Scribe call: `no_verbatim=True`, `tag_audio_events=False`, `language_code="fas"`, `diarize=True`, `timestamps_granularity="word"`, `model_id="scribe_v2"`. See `app/services/transcription.py`.

## Gotchas

### Pipeline holds bound `SessionLocal`

`app/services/pipeline.py` does `from app.db import SessionLocal` at module load → captures its own reference. Tests must `monkeypatch.setattr(app.services.pipeline, "SessionLocal", new)` in addition to `app.db.SessionLocal`. See `tests/conftest.py` for the pattern. New service modules MUST accept `session: AsyncSession` as a parameter (see `glossary.py`, `series_match.py`) — never capture `SessionLocal` at top level.

### SQLAlchemy async + M:N reassignment

Don't `meeting.tags = [...]` on async session — triggers `MissingGreenlet` via lazy load on the existing collection. Use direct `MeetingTag` row delete + insert (see `_set_meeting_tags` in `routers/meetings.py`). Same applies to any future M:N relationship.

### Alembic batch FK names for SQLite

Autogen produces `create_foreign_key(None, ...)` and `drop_constraint(None, ...)` inside `batch_alter_table`. SQLite downgrade fails on `None`. Always name the FK explicitly (e.g. `'fk_meetings_series_id'`) in both upgrade and downgrade. See `alembic/versions/98bfcb3b85de_*.py`.

### SQLAlchemy 2.0 `Mapped` + future annotations

Modules use `from __future__ import annotations`. Don't quote forward refs inside `Mapped[...]` (write `Mapped[Series | None]`, not `Mapped["Series | None"]`). Pyright misresolves quoted refs even when the class is defined later in the same module.

### FastAPI list query params need explicit `Query`

`tag_ids: list[str] | None = None` won't parse repeated `?tag_ids=...&tag_ids=...` — single value comes through as a string and the `in_()` filter silently misbehaves. Use `tag_ids: list[str] | None = Query(None)`.

### httpx async multipart with list fields

In tests, prefer `data={"tag_ids": [t1, t2]}` (dict with list value) over `data=[("tag_ids", t1), ("tag_ids", t2)]` (list of tuples). The list-of-tuples form trips `Attempted to send a sync request with an AsyncClient instance` on multipart uploads.

### Next.js 16 quirks

This is Next 16, not 14/15. Read `frontend/AGENTS.md` and `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` before touching App Router APIs. Turbopack is default. `middleware` → `proxy`. Server Components are the default; opt into client with `"use client"`.

### Pyright editor warnings

Pyright in VS Code may flag `app.*` imports as unresolved despite `[tool.pyright] extraPaths = ["."]` in `pyproject.toml`. False positive — pytest and uvicorn resolve them fine via the `[tool.pytest.ini_options] pythonpath = ["."]` setting. Ignore those specific reportMissingImports warnings; do NOT add `# type: ignore` everywhere.

Pyright also flags `client.speech_to_text.convert(...)` as unknown attribute on `ElevenLabs`. SDK type stubs are incomplete; runtime works.

### WebM duration

`MediaRecorder` produces WebM blobs that often lack a duration header. `ffprobe` returns `N/A` → `storage.probe_duration_seconds()` returns `None` → `meetings.duration_s` stays null. UI handles `null` gracefully ("—"). Don't try to fix at the recorder side.

### CORS

`backend/app/main.py` builds `allow_origin_regex` from `settings.ALLOWED_ORIGIN`. Override with `ALLOWED_ORIGIN_REGEX` env var if needed.

### Audio retention

Files kept indefinitely under `backend/storage/audio/{uuid}.{ext}`. No cleanup job. Disk grows. Regenerate-summary uses original audio implicitly (via cached transcript), so deleting audio is safe after `done` only if you don't plan to re-transcribe with different params.

### Detail page dependent-query cache must be invalidated on status flip

`frontend/app/meetings/[id]/page.tsx` polls `["meeting", id]` only while status ∈ {uploaded, transcribing, summarizing}. The summary/transcript/action-items views all use `retry: false`, so their first 404 sticks in the cache. The page-level `useEffect` watching `status` invalidates `["meeting", id]` + `["transcript", id]` + `["summary", id]` when status flips to `done` or `failed`. Without this, the user sees "not ready" until a hard reload.

### Status transition must be synchronous when an endpoint queues a BackgroundTask

If a route enqueues `BackgroundTasks` work that the client should see as in-flight (e.g. `regenerate-summary`), flip `meeting.status` to the in-flight enum + `await session.commit()` *before* `background_tasks.add_task(...)`. Otherwise the client's invalidate-then-refetch lands before the background task even starts and sees the old terminal status, so polling never resumes. Mirror this on the frontend with `onMutate` setting query data optimistically. See `regenerate` endpoint in `routers/meetings.py` and `regenerateMut` in `app/meetings/[id]/page.tsx`.

### Adding required fields to `summarizer.JSON_SCHEMA`

Only `tests/test_summarizer_mock.py::VALID_BRIEF` runs through `jsonschema.validate` and must include every required field. The pipeline e2e tests (`test_pipeline_e2e.VALID_BRIEF`, `test_meetings_extensions::test_summary_exposes_new_fields`) patch `app.services.summarizer.summarize` directly with `return_value=...` — they bypass validation, so they don't need the new field unless your downstream code depends on its presence in the dict.

### Pipeline cancellation is best-effort, sentinel-based

`services/pipeline.py` keeps `_cancel_events: dict[str, asyncio.Event]`. `run_pipeline` and `regenerate_summary` each register an event on entry and `pop` it in `finally`. `_check_cancel(ev)` is called at four boundaries: pipeline entry, after `transcribe_async`, after `_persist_transcript`, after `summarize`. The `POST /{id}/cancel` endpoint flips status to `FAILED` with `error_message=pipeline.CANCELLED_SENTINEL` synchronously (instant UI feedback) **then** signals the event. ElevenLabs Scribe HTTP can't be torn down mid-call, so an in-flight Scribe request still completes — the result is discarded by the next `_check_cancel`. Frontend (`page.tsx`, `meeting-status.tsx`) treats `error_message === CANCELLED_SENTINEL` as a separate state from real errors. Don't add a new `CANCELLED` enum — the sentinel approach skips an Alembic migration.

### ASGITransport + BackgroundTasks: test client awaits BG before responding

`tests/conftest.py` wires httpx via `ASGITransport(app=app)`. Starlette runs `BackgroundTasks` *after the response body is sent* — but with ASGITransport that means inside the same `await client.post(...)` call. If a mocked pipeline coroutine blocks (e.g. an `asyncio.Event.wait()`), the upload `await` itself hangs forever. Don't try to test mid-pipeline behavior by blocking transcribe/summarize mocks; mock `app.services.pipeline.run_pipeline` to a no-op async fn instead and assert endpoint contracts. See `test_cancel_endpoint_flips_status_synchronously` for the pattern.

### Long lists use `content-visibility: auto`, not virtualization libs

Minutes view renders 100s–1000s of rows for long meetings. Each segment Card sets `style={{ contentVisibility: "auto", containIntrinsicSize: "auto 88px" }}`. Browser skips paint + layout for off-screen rows — same effective benefit as `react-virtual` with zero deps and no scroll-position math. Chrome/Edge only (which is the target). Don't reach for a virtualization library before trying this pattern on any new long-list views.

### Chat endpoint is POST + SSE — use fetch+ReadableStream, not EventSource

`/api/meetings/{id}/chat/ask` returns `text/event-stream` but is **POST** (body carries the question). `EventSource` is GET-only and cannot send a body, so the frontend uses `fetch(..., {method:"POST", body, signal})` + manual `ReadableStream` decoding (`frontend/lib/api.ts::streamChatAsk`). Server emits structured frames `data: {"type":"delta"|"done"|"error", ...}\n\n`. Don't try to switch to `streamSummary`'s `EventSource` pattern — it won't work for POST. Persist semantics: user message is committed BEFORE stream starts (durable on failure); assistant message committed only on successful completion (no partial rows).

## Conventions

- **Python:** `snake_case`, type hints on all signatures, `from __future__ import annotations` at top of files using forward refs. SQLAlchemy 2.0 declarative + async sessions.
- **TypeScript:** `camelCase`, strict types from `lib/api.ts`. Components functional + hooks. shadcn primitives only — do not hand-roll buttons/cards.
- **RTL:** `<html dir="rtl">` global. Persian text uses Vazirmatn (`--font-sans` CSS var). Use `dirOf(text)` from `lib/rtl.ts` for mixed-content containers. Persian dates via `Intl.DateTimeFormat('fa-IR-u-ca-persian')` (helper: `formatJalali`).
- **Errors:** raise `HTTPException` from routers; `RuntimeError` from services with prefixed message (`"Scribe failed: ..."`). Pipeline writes traceback into `Meeting.error_message` on failure — never swallow exceptions silently.
- **No trailing summaries** in dev chat. Code-first.

## Adding a new field to Meeting

1. `app/models.py` — add `Mapped[T | None] = mapped_column(...)`.
2. `app/schemas.py` — add to `MeetingRead` (and `MeetingCreate` if user-settable).
3. `uv run alembic revision --autogenerate -m "add X"` → review the generated file. Name any new FK constraints explicitly so SQLite downgrade works.
4. `uv run alembic upgrade head` — verify reversible by running `alembic downgrade -1 && alembic upgrade head`.
5. `app/routers/meetings.py::upload_meeting` — accept as `Form(None)` if user-settable; persist on `Meeting`. Update `_meeting_detail` helper. For M:N relations use a direct `delete + insert` helper, NOT `meeting.rel = [...]`.
6. Pipeline path — read from row in `_load_meeting_context` (returns `_MeetingCtx`), pass to downstream service.
7. `frontend/lib/api.ts` — add to `Meeting` / `MeetingDetail` interface and `UploadMeetingOptions`.
8. `frontend/components/upload-section.tsx` — add input, plumb to `uploadMeeting`. If recording-relevant, extend `<Recorder/>` AND `<TabRecorder/>` props too.

## What lives where (quick lookup)

| Question | File |
|---|---|
| Where's the JSON schema sent to OpenRouter? | `backend/app/services/summarizer.py::JSON_SCHEMA` |
| What system prompt does the LLM see? | `backend/app/prompts/summary_system.txt` |
| How is the WebSocket URL built? | `frontend/lib/scribe-realtime.ts::connect` |
| Where is the AudioWorklet source? | `frontend/lib/pcm-worklet.ts::PCM_WORKLET_SRC` (string registered via blob URL) |
| Where do speakers get seeded? | `backend/app/services/pipeline.py::_persist_transcript` |
| Where is LLM speaker→name auto-assign applied? | `backend/app/services/speakers.py::apply_speaker_names` (skips speakers with non-empty `display_name`, syncs to series glossary like `rename_speaker`) |
| Where does the pipeline call speaker auto-assign? | `backend/app/services/pipeline.py::_apply_speaker_names_from_summary` (after `summarize`, in both `run_pipeline` and `regenerate_summary`) |
| Where are minutes built (server-side, not LLM)? | `backend/app/services/pipeline.py::build_minutes_segments` (uses shared `_segment_words`; pipeline assigns `data["minutes"] = build_minutes_segments(words)` before persist) |
| Where is in-flight processing cancelled? | `backend/app/routers/meetings.py::cancel_meeting` flips status synchronously; `backend/app/services/pipeline.py::request_cancel` signals the asyncio.Event in `_cancel_events` |
| Where does the frontend render the cancelled state? | `frontend/components/meeting-status.tsx` (badge label) + `frontend/app/meetings/[id]/page.tsx` (failed card) — both check `error_message === CANCELLED_SENTINEL` from `lib/api.ts` |
| Where is the diarized prompt built? | `backend/app/services/pipeline.py::build_diarized_prompt` (>1.2s gap or speaker change → new segment) |
| Where is the SSE summary endpoint? | `backend/app/routers/meetings.py::stream_summary` |
| Where are status labels translated? | `frontend/components/meeting-status.tsx` |
| Where is the keyterm validator? | `backend/app/services/glossary.py::_is_valid_keyterm` (50/20-char caps depending on `realtime` flag) |
| Where does the series fuzzy-match run? | `backend/app/services/series_match.py::suggest_series` (rapidfuzz `token_sort_ratio`, threshold 85) |
| Where are realtime keyterms passed? | `frontend/lib/scribe-realtime.ts::connect` (URL params, capped 50 × 20chars) |
| Where does pipeline read series-derived params? | `backend/app/services/pipeline.py::_load_meeting_context` (returns `_MeetingCtx` with `keyterms` + `email_tone`) |
| How are M:N tags assigned? | `backend/app/routers/meetings.py::_set_meeting_tags` (delete + insert into `meeting_tags`) |
| Where is the tab audio captured (web app, picker)? | `frontend/components/tab-recorder.tsx::handleStart` |
| Where is the per-meeting chat endpoint? | `backend/app/routers/chat.py` (GET `/messages`, POST `/ask` SSE, DELETE `/messages`; persists user msg pre-stream, assistant msg post-stream; 409 if status≠`done`) |
| Where does chat assemble meeting context? | `backend/app/services/chat.py::build_meeting_context` (reuses `pipeline.build_diarized_prompt` + dumps all 7 summary artifacts + speaker_names) |
| Where is the chat tab rendered? | `frontend/app/meetings/[id]/page.tsx` (9th tab, `accent: true` → indigo→violet gradient + `Sparkles` icon) + `frontend/components/chat-view.tsx` (UI) + `frontend/lib/api.ts::streamChatAsk` (POST + ReadableStream SSE parser) |

## What this project intentionally does NOT do

- Multi-user / auth.
- Multi-tenant DB.
- Real-time live diarization (impossible with current ElevenLabs realtime model).
- Audio chunked progressive upload (single blob on stop, capped at 500MB).
- Cross-language meetings (Persian only; flip `language_code` if you need another single language).
- Background workers (Redis/Celery). Pipeline runs in FastAPI `BackgroundTasks`, fine for single-user load.
- Persisted live captions. They're display-only, discarded on stop. The diarized batch transcript is the authoritative record.
- Browser extension (removed). Tab capture is web-app only via `getDisplayMedia`.
- In-meeting "recording" indicator overlay.
