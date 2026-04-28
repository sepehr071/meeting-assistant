import {
  ScribeRealtimeClient,
  type CaptionEvent,
} from "./lib/scribe-realtime";
import { int16ToBase64, pcmWorkletUrl } from "./lib/pcm-worklet";
import { getRealtimeToken, uploadMeeting } from "./lib/api";
import type {
  Broadcast,
  CaptureState,
  StartPayload,
  SWToOffscreen,
} from "./lib/messaging";

const HARD_LIMIT_S = 7200;

interface Session {
  ctx: AudioContext;
  tabStream: MediaStream;
  micStream: MediaStream | null;
  workletNode: AudioWorkletNode;
  analyser: AnalyserNode;
  recorder: MediaRecorder;
  chunks: Blob[];
  scribe: ScribeRealtimeClient | null;
  workletUrl: string;
  payload: StartPayload;
  tabUrl: string;
  seconds: number;
  timer: ReturnType<typeof setInterval> | null;
  levelTimer: ReturnType<typeof setInterval> | null;
  stopping: boolean;
}

let session: Session | null = null;

function broadcast(msg: Broadcast): void {
  void chrome.runtime.sendMessage(msg).catch(() => {
    /* no popup listening — fine */
  });
}

function emitStatus(
  state: CaptureState,
  extra: Partial<{
    seconds: number;
    level: number;
    meetingId: string;
    error: string;
    tabUrl: string;
  }> = {},
): void {
  broadcast({ type: "STATUS", status: { state, ...extra } });
}

async function start(
  streamId: string,
  payload: StartPayload,
  tabUrl: string,
): Promise<void> {
  if (session) {
    emitStatus("error", { error: "Capture already in progress" });
    return;
  }
  emitStatus("starting", { tabUrl });

  let tabStream: MediaStream | null = null;
  let micStream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let workletUrl: string | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let recorder: MediaRecorder | null = null;
  let scribe: ScribeRealtimeClient | null = null;

  try {
    // 1. Redeem the tab capture stream id.
    tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // chromeMediaSource / chromeMediaSourceId are non-standard tabCapture
        // constraints recognized by Chromium when redeeming a stream id.
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      } as unknown as MediaTrackConstraints,
      video: false,
    });

    // 2. Optionally grab the mic.
    if (payload.withMic) {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
    }

    // 3. AudioContext + worklet.
    ctx = new AudioContext({ sampleRate: 48000 });
    workletUrl = pcmWorkletUrl();
    await ctx.audioWorklet.addModule(workletUrl);

    // 4. Build the graph: tab + mic -> mixDest.
    const tabSource = ctx.createMediaStreamSource(tabStream);
    const mixDest = ctx.createMediaStreamDestination();
    tabSource.connect(mixDest);

    let micSource: MediaStreamAudioSourceNode | null = null;
    if (micStream) {
      micSource = ctx.createMediaStreamSource(micStream);
      micSource.connect(mixDest);
    }

    // 5. CRITICAL: connect tab audio to ctx.destination so the user can still
    // hear the meeting. Mic is NOT connected to destination (would echo).
    tabSource.connect(ctx.destination);

    // 6. Worklet feeds Scribe realtime; reads from mixed stream so PCM matches
    // the WebM blob we send for batch.
    const mixSource = ctx.createMediaStreamSource(mixDest.stream);
    workletNode = new AudioWorkletNode(ctx, "pcm-downsampler", {
      processorOptions: { outSampleRate: 16000 },
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
    });
    mixSource.connect(workletNode);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    mixSource.connect(analyser);

    // 7. MediaRecorder on the mixed stream.
    recorder = new MediaRecorder(mixDest.stream, {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 64000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.start(1000);

    // 8. Realtime token + Scribe client.
    let token = "";
    let keyterms: string[] = [];
    try {
      const resp = await getRealtimeToken(payload.seriesId ?? null);
      token = resp.token;
      keyterms = resp.keyterms ?? [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Continue without realtime — batch transcription is still authoritative.
      emitStatus("error", { error: `realtime token failed: ${msg}` });
    }

    if (token) {
      scribe = new ScribeRealtimeClient({
        token,
        languageCode: "fas",
        sampleRate: 16000,
        keyterms,
        onEvent: (e: CaptionEvent) => {
          if (e.type === "partial" || e.type === "committed") {
            broadcast({
              type: "CAPTION",
              caption: { kind: e.type, text: e.text },
            });
          } else if (e.type === "error") {
            // Live captions failed — keep recording. Batch path still works.
            emitStatus("error", { error: `scribe: ${e.error}` });
          }
        },
      });

      workletNode.port.onmessage = (ev: MessageEvent) => {
        const buf = ev.data as ArrayBuffer;
        try {
          scribe?.sendChunk(int16ToBase64(buf));
        } catch (err) {
          console.error("[offscreen] sendChunk failed", err);
        }
      };

      try {
        await scribe.connect();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emitStatus("error", { error: `realtime connect failed: ${msg}` });
        scribe = null;
      }
    }

    // 9. Auto-stop if any track ends (e.g. user closed the tab).
    const onTrackEnded = () => {
      if (!session?.stopping) void stop();
    };
    tabStream.getTracks().forEach((t) => t.addEventListener("ended", onTrackEnded));
    micStream?.getTracks().forEach((t) =>
      t.addEventListener("ended", onTrackEnded),
    );

    // 10. Persist session state.
    session = {
      ctx,
      tabStream,
      micStream,
      workletNode,
      analyser,
      recorder,
      chunks,
      scribe,
      workletUrl,
      payload,
      tabUrl,
      seconds: 0,
      timer: null,
      levelTimer: null,
      stopping: false,
    };

    emitStatus("recording", { seconds: 0, tabUrl });

    session.timer = setInterval(() => {
      if (!session) return;
      session.seconds += 1;
      emitStatus("recording", { seconds: session.seconds, tabUrl });
      if (session.seconds >= HARD_LIMIT_S) {
        void stop();
      }
    }, 1000);

    const data = new Uint8Array(analyser.fftSize);
    session.levelTimer = setInterval(() => {
      if (!session) return;
      session.analyser.getByteTimeDomainData(data);
      let sumSq = 0;
      for (let i = 0; i < data.length; i++) {
        const sample = data[i] ?? 128;
        const v = (sample - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / data.length);
      const level = Math.min(1, rms * 1.6);
      emitStatus("recording", {
        seconds: session.seconds,
        level,
        tabUrl,
      });
    }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Cleanup partial resources.
    try {
      tabStream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    try {
      micStream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    try {
      workletNode?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {
      /* ignore */
    }
    try {
      scribe?.close();
    } catch {
      /* ignore */
    }
    try {
      await ctx?.close();
    } catch {
      /* ignore */
    }
    if (workletUrl) URL.revokeObjectURL(workletUrl);
    session = null;
    emitStatus("error", { error: msg });
  }
}

async function stop(): Promise<void> {
  const s = session;
  if (!s || s.stopping) return;
  s.stopping = true;
  emitStatus("stopping", { seconds: s.seconds, tabUrl: s.tabUrl });

  if (s.timer) {
    clearInterval(s.timer);
    s.timer = null;
  }
  if (s.levelTimer) {
    clearInterval(s.levelTimer);
    s.levelTimer = null;
  }

  try {
    s.scribe?.close();
  } catch {
    /* ignore */
  }

  // Stop the recorder and wait for the final dataavailable + stop events.
  await new Promise<void>((resolve) => {
    if (s.recorder.state === "inactive") {
      resolve();
      return;
    }
    s.recorder.addEventListener("stop", () => resolve(), { once: true });
    try {
      s.recorder.stop();
    } catch {
      resolve();
    }
  });

  // Tear down audio graph + tracks.
  try {
    s.workletNode.port.onmessage = null;
    s.workletNode.disconnect();
  } catch {
    /* ignore */
  }
  try {
    s.analyser.disconnect();
  } catch {
    /* ignore */
  }
  s.tabStream.getTracks().forEach((t) => t.stop());
  s.micStream?.getTracks().forEach((t) => t.stop());
  try {
    await s.ctx.close();
  } catch {
    /* ignore */
  }
  URL.revokeObjectURL(s.workletUrl);

  const blob = new Blob(s.chunks, { type: "audio/webm" });
  session = null;

  if (blob.size === 0) {
    emitStatus("error", { error: "Empty recording" });
    return;
  }

  emitStatus("uploading", { seconds: s.seconds, tabUrl: s.tabUrl });
  try {
    const meeting = await uploadMeeting(blob, {
      title: s.payload.title ?? null,
      num_speakers: s.payload.numSpeakers ?? null,
      meeting_brief: s.payload.meetingBrief ?? null,
      series_id: s.payload.seriesId ?? null,
      tag_ids: s.payload.tagIds ?? [],
      filename: "tab-recording.webm",
    });
    emitStatus("done", { meetingId: meeting.id, tabUrl: s.tabUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emitStatus("error", { error: `upload failed: ${msg}` });
    return;
  }

  // Give the popup a moment to receive the final status, then close.
  setTimeout(() => {
    chrome.offscreen.closeDocument().catch(() => {
      /* might already be closed */
    });
  }, 1500);
}

chrome.runtime.onMessage.addListener((msg: SWToOffscreen) => {
  if (msg.type === "START") {
    void start(msg.streamId, msg.payload, msg.tabUrl);
  } else if (msg.type === "STOP") {
    void stop();
  }
  return false;
});
