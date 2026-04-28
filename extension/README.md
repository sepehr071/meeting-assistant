# Meeting Assistant Capture (Chrome MV3 Extension)

Captures the audio of the active browser tab plus your microphone, streams PCM to ElevenLabs Scribe v2 Realtime for live captions, and on stop POSTs a WebM blob to the Meeting Assistant FastAPI backend for diarized batch transcription and summarization.

Use it when the meeting is in a tab — Google Meet, Zoom Web, Teams Web, or any web-based call. The companion web app (`frontend/`) keeps its own mic-only recorder; this extension is additive.

## Install (development)

```bash
cd extension
pnpm install        # or: npm install
pnpm dev            # vite + crxjs, auto-reload
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `extension/dist`.

The extension icon appears in the toolbar. Pin it for easy access.

## Build (production / sideload)

```bash
pnpm build
```

Outputs `extension/dist/`. Zip and sideload — no Web Store publish required for self-use.

## Backend URL

Defaults to `http://localhost:8000`. The popup will expose a setting; until then you can override via the DevTools console while viewing any extension page:

```js
chrome.storage.local.set({ backendUrl: "http://localhost:8000" });
```

The value is read on every API call via `lib/storage.ts::getBackendUrl`.

## How it works

- **Service worker** (`service_worker.ts`) — listens for popup `START_REQUEST`, calls `chrome.tabCapture.getMediaStreamId` for the active tab, opens an offscreen document, and forwards the stream id.
- **Offscreen document** (`offscreen.ts`) — redeems the stream id, optionally grabs the mic, mixes via Web Audio, fans out to:
  - an `AudioWorklet` that downsamples to 16 kHz int16 PCM and ships base64 frames over WebSocket to ElevenLabs Scribe Realtime (live captions),
  - a `MediaRecorder` that captures a WebM/Opus blob,
  - and `ctx.destination` for the **tab** stream only (so the user still hears the meeting). The mic is intentionally not routed to `destination` to avoid echo.
- On stop (manual or because a track ended), the blob is POSTed to `${backend}/api/meetings/upload` and the offscreen document closes itself.

## Permissions

- `tabCapture`, `offscreen`, `activeTab`, `storage`, `tabs`
- Host permissions for `localhost:8000`, `127.0.0.1:8000`, and `api.elevenlabs.io`

## Typecheck

```bash
pnpm exec tsc --noEmit
```
