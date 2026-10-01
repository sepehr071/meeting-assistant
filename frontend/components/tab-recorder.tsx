"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveCaptions } from "@/components/live-captions";
import { cn } from "@/lib/utils";
import {
  ScribeRealtimeClient,
  type CaptionEvent,
} from "@/lib/scribe-realtime";
import { int16ToBase64, pcmWorkletUrl } from "@/lib/pcm-worklet";
import { getRealtimeToken, uploadMeeting } from "@/lib/api";

const SOFT_LIMIT_S = 6300;
const HARD_LIMIT_S = 7200;
const EQ_BARS = 14;

function formatTimer(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function EqMeter({
  level,
  active,
}: {
  level: number;
  active: boolean;
}) {
  const bars = useMemo(() => Array.from({ length: EQ_BARS }), []);
  return (
    <div className="flex h-9 flex-1 items-end gap-[3px]" aria-hidden="true">
      {bars.map((_, i) => {
        const center = (EQ_BARS - 1) / 2;
        const distance = Math.abs(i - center) / center;
        const intensity = Math.max(0.06, level * (1 - distance * 0.7));
        const heightPct = Math.min(100, 16 + intensity * 110);
        return (
          <span
            key={i}
            style={{ height: `${heightPct}%` }}
            className={cn(
              "w-[3px] rounded-full transition-[height,background-color] duration-100",
              active ? "bg-primary/80" : "bg-muted-foreground/30",
            )}
          />
        );
      })}
    </div>
  );
}

export function TabRecorder({
  title,
  numSpeakers,
  meetingBrief,
  seriesId,
  tagIds,
  onUploaded,
  inline = false,
}: {
  title?: string;
  numSpeakers?: number | null;
  meetingBrief?: string;
  seriesId?: string | null;
  tagIds?: string[];
  onUploaded?: (id: string) => void;
  inline?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [committed, setCommitted] = useState("");
  const [partial, setPartial] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [withMic, setWithMic] = useState(true);

  const tabStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const tabSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const scribeClientRef = useRef<ScribeRealtimeClient | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workletUrlRef = useRef<string | null>(null);
  const softWarnedRef = useRef(false);

  const cleanupAll = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (levelIntervalRef.current) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }
    if (scribeClientRef.current) {
      scribeClientRef.current.close();
      scribeClientRef.current = null;
    }
    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.port.onmessage = null;
        workletNodeRef.current.disconnect();
      } catch {
        /* ignore */
      }
      workletNodeRef.current = null;
    }
    for (const ref of [tabSourceRef, micSourceRef]) {
      if (ref.current) {
        try {
          ref.current.disconnect();
        } catch {
          /* ignore */
        }
        ref.current = null;
      }
    }
    if (mixDestRef.current) {
      try {
        mixDestRef.current.disconnect();
      } catch {
        /* ignore */
      }
      mixDestRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        /* ignore */
      }
      analyserRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        void audioCtxRef.current.close();
      } catch {
        /* ignore */
      }
      audioCtxRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {
        /* ignore */
      }
      mediaRecorderRef.current = null;
    }
    for (const ref of [tabStreamRef, micStreamRef]) {
      if (ref.current) {
        ref.current.getTracks().forEach((t) => t.stop());
        ref.current = null;
      }
    }
    if (workletUrlRef.current) {
      URL.revokeObjectURL(workletUrlRef.current);
      workletUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, [cleanupAll]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      cleanupAll();
      return null;
    }

    if (scribeClientRef.current) {
      scribeClientRef.current.close();
      scribeClientRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (levelIntervalRef.current) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }

    const stopped: Promise<void> = new Promise((resolve) => {
      if (recorder.state === "inactive") {
        resolve();
        return;
      }
      recorder.addEventListener("stop", () => resolve(), { once: true });
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });
    await stopped;

    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];

    cleanupAll();
    return blob;
  }, [cleanupAll]);

  const handleStop = useCallback(async () => {
    setRecording(false);
    setUploading(true);
    try {
      const blob = await stopRecording();
      if (!blob || blob.size === 0) {
        setUploading(false);
        return;
      }
      const meeting = await uploadMeeting(blob, {
        title,
        num_speakers: numSpeakers ?? null,
        meeting_brief: meetingBrief,
        series_id: seriesId ?? null,
        tag_ids: tagIds ?? [],
        filename: "tab-recording.webm",
      });
      toast.success("ضبط تب با موفقیت بارگذاری شد");
      onUploaded?.(meeting.id);
      setSeconds(0);
      setCommitted("");
      setPartial("");
      setLevel(0);
      softWarnedRef.current = false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(`بارگذاری ناموفق بود: ${msg}`);
    } finally {
      setUploading(false);
    }
  }, [
    meetingBrief,
    numSpeakers,
    onUploaded,
    seriesId,
    stopRecording,
    tagIds,
    title,
  ]);

  const handleStart = useCallback(async () => {
    setError(null);
    setCommitted("");
    setPartial("");
    setSeconds(0);
    setLevel(0);
    softWarnedRef.current = false;

    let displayStream: MediaStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`اشتراک‌گذاری تب رد شد: ${msg}`);
      toast.error("اشتراک‌گذاری تب رد شد");
      return;
    }

    // Discard video tracks immediately. We only need audio.
    displayStream.getVideoTracks().forEach((t) => t.stop());

    if (displayStream.getAudioTracks().length === 0) {
      displayStream.getTracks().forEach((t) => t.stop());
      const msg =
        "هیچ صدای تبی به اشتراک گذاشته نشد. هنگام انتخاب تب، گزینهٔ «به اشتراک‌گذاری صدای تب» را تیک بزنید.";
      setError(msg);
      toast.error("صدای تب اشتراک نشد");
      return;
    }
    tabStreamRef.current = displayStream;

    // Auto-stop if user hits the browser's "Stop sharing" bar.
    displayStream.getAudioTracks()[0].addEventListener("ended", () => {
      void handleStop();
    });

    let micStream: MediaStream | null = null;
    if (withMic) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            channelCount: 1,
          },
        });
        micStreamRef.current = micStream;
      } catch (err) {
        // Mic optional — continue without it.
        console.warn("[tab-recorder] mic denied, continuing tab-only", err);
        toast.warning("میکروفون در دسترس نیست — فقط صدای تب ضبط می‌شود");
      }
    }

    let audioCtx: AudioContext;
    try {
      audioCtx = new AudioContext({ sampleRate: 48000 });
    } catch {
      audioCtx = new AudioContext();
    }
    audioCtxRef.current = audioCtx;

    const workletUrl = pcmWorkletUrl();
    workletUrlRef.current = workletUrl;
    try {
      await audioCtx.audioWorklet.addModule(workletUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`بارگذاری AudioWorklet ناموفق بود: ${msg}`);
      toast.error("بارگذاری AudioWorklet ناموفق بود");
      cleanupAll();
      return;
    }

    const tabSource = audioCtx.createMediaStreamSource(displayStream);
    tabSourceRef.current = tabSource;

    const mixDest = audioCtx.createMediaStreamDestination();
    mixDestRef.current = mixDest;
    tabSource.connect(mixDest);

    if (micStream) {
      const micSource = audioCtx.createMediaStreamSource(micStream);
      micSourceRef.current = micSource;
      micSource.connect(mixDest);
    }

    const recorderStream = mixDest.stream;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(recorderStream, {
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 64000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`MediaRecorder در دسترس نیست: ${msg}`);
      toast.error("MediaRecorder در دسترس نیست");
      cleanupAll();
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    mediaRecorderRef.current = recorder;
    recorder.start(1000);

    const workletNode = new AudioWorkletNode(audioCtx, "pcm-downsampler", {
      processorOptions: { outSampleRate: 16000 },
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
    });
    workletNodeRef.current = workletNode;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    const mixSource = audioCtx.createMediaStreamSource(recorderStream);
    mixSource.connect(workletNode);
    mixSource.connect(analyser);

    let token: string;
    let keyterms: string[] = [];
    try {
      const resp = await getRealtimeToken(seriesId);
      token = resp.token;
      keyterms = resp.keyterms ?? [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`دریافت توکن لحظه‌ای ناموفق بود: ${msg}`);
      toast.error("دریافت توکن لحظه‌ای ناموفق بود");
      cleanupAll();
      return;
    }

    const scribeClient = new ScribeRealtimeClient({
      token,
      languageCode: "fas",
      sampleRate: 16000,
      keyterms,
      onEvent: (e: CaptionEvent) => {
        if (e.type === "partial") {
          setPartial(e.text);
        } else if (e.type === "committed") {
          if (e.text) {
            setCommitted((prev) => (prev ? `${prev} ${e.text}` : e.text));
          }
          setPartial("");
        } else if (e.type === "error") {
          setError(e.error);
        }
      },
    });
    scribeClientRef.current = scribeClient;

    workletNode.port.onmessage = (ev: MessageEvent) => {
      const buf = ev.data as ArrayBuffer;
      try {
        scribeClient.sendChunk(int16ToBase64(buf));
      } catch (err) {
        console.error("[tab-recorder] sendChunk failed", err);
      }
    };

    try {
      await scribeClient.connect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`اتصال به سرویس لحظه‌ای ناموفق بود: ${msg}`);
      toast.error("اتصال به سرویس لحظه‌ای ناموفق بود");
      cleanupAll();
      return;
    }

    setRecording(true);

    timerIntervalRef.current = setInterval(() => {
      setSeconds((prev) => {
        const next = prev + 1;
        if (next >= HARD_LIMIT_S) {
          void handleStop();
        } else if (!softWarnedRef.current && next >= SOFT_LIMIT_S) {
          softWarnedRef.current = true;
          toast.warning("ضبط به سقف زمانی نزدیک می‌شود");
        }
        return next;
      });
    }, 1000);

    const data = new Uint8Array(analyser.fftSize);
    levelIntervalRef.current = setInterval(() => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteTimeDomainData(data);
      let sumSq = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i]! - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / data.length);
      setLevel(Math.min(1, rms * 1.6));
    }, 100);
  }, [cleanupAll, handleStop, seriesId, withMic]);

  const onClick = useCallback(() => {
    if (uploading) return;
    if (recording) {
      void handleStop();
    } else {
      void handleStart();
    }
  }, [handleStart, handleStop, recording, uploading]);

  const buttonLabel = uploading
    ? "در حال بارگذاری..."
    : recording
      ? "توقف ضبط"
      : "ضبط تب دیگر";

  const body = (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onClick}
          disabled={uploading}
          aria-label={buttonLabel}
          className={cn(
            "relative grid size-14 shrink-0 place-items-center rounded-full text-white shadow-sm transition-all outline-none",
            "focus-visible:ring-3 focus-visible:ring-ring/50",
            "active:scale-[0.97]",
            "disabled:cursor-not-allowed disabled:opacity-60",
            recording
              ? "bg-destructive hover:bg-destructive/90"
              : "bg-primary hover:bg-primary/90",
          )}
        >
          {recording && (
            <span
              className="absolute inset-0 -z-10 rounded-full ring-4 ring-destructive/40 animate-record-ring"
              aria-hidden="true"
            />
          )}
          {uploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : recording ? (
            <Square className="size-5 fill-current" />
          ) : (
            <Monitor className="size-5" />
          )}
        </button>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-mono text-base font-semibold tabular-nums">
              {formatTimer(seconds)}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium",
                recording
                  ? "text-destructive"
                  : uploading
                    ? "text-primary"
                    : "text-muted-foreground",
              )}
            >
              {recording && (
                <span
                  className="size-1.5 rounded-full bg-destructive animate-pulse-dot"
                  aria-hidden="true"
                />
              )}
              {recording
                ? "در حال ضبط"
                : uploading
                  ? "بارگذاری"
                  : "آماده"}
            </span>
          </div>
          <EqMeter level={level} active={recording} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={withMic}
          onChange={(e) => setWithMic(e.target.checked)}
          disabled={recording || uploading}
          className="size-4 rounded border-input accent-primary"
        />
        <span>میکروفون من را نیز ضبط کن</span>
      </label>

      <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs leading-6 text-muted-foreground">
        پس از کلیک، مرورگر پنجره‌ی انتخاب تب باز می‌کند. تب جلسه را انتخاب کنید
        و گزینهٔ «به اشتراک‌گذاری صدای تب» را تیک بزنید.
      </p>

      <LiveCaptions committed={committed} partial={partial} />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );

  if (inline) {
    return body;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>ضبط تب دیگر</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
