"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LiveCaptions } from "@/components/live-captions";
import {
  ScribeRealtimeClient,
  type CaptionEvent,
} from "@/lib/scribe-realtime";
import { int16ToBase64, pcmWorkletUrl } from "@/lib/pcm-worklet";
import { getRealtimeToken, uploadMeeting } from "@/lib/api";

const SOFT_LIMIT_S = 6300;
const HARD_LIMIT_S = 7200;

function formatTimer(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function Recorder({
  title,
  numSpeakers,
  meetingBrief,
  seriesId,
  tagIds,
  onUploaded,
}: {
  title?: string;
  numSpeakers?: number | null;
  meetingBrief?: string;
  seriesId?: string | null;
  tagIds?: string[];
  onUploaded?: (id: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [committed, setCommitted] = useState("");
  const [partial, setPartial] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
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
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        /* ignore */
      }
      sourceNodeRef.current = null;
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
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
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
      recorder.addEventListener(
        "stop",
        () => resolve(),
        { once: true },
      );
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });
    await stopped;

    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
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
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        /* ignore */
      }
      sourceNodeRef.current = null;
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
        await audioCtxRef.current.close();
      } catch {
        /* ignore */
      }
      audioCtxRef.current = null;
    }
    if (workletUrlRef.current) {
      URL.revokeObjectURL(workletUrlRef.current);
      workletUrlRef.current = null;
    }
    mediaRecorderRef.current = null;

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
        filename: "recording.webm",
      });
      toast.success("ضبط با موفقیت بارگذاری شد");
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

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`دسترسی به میکروفون رد شد: ${msg}`);
      toast.error("دسترسی به میکروفون رد شد");
      return;
    }
    mediaStreamRef.current = stream;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 64000,
      });
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      const msg = err instanceof Error ? err.message : String(err);
      setError(`MediaRecorder در دسترس نیست: ${msg}`);
      toast.error("MediaRecorder در دسترس نیست");
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    mediaRecorderRef.current = recorder;
    recorder.start(1000);

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

    const source = audioCtx.createMediaStreamSource(stream);
    sourceNodeRef.current = source;

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

    source.connect(analyser);
    source.connect(workletNode);

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
        console.error("[recorder] sendChunk failed", err);
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
        const v = (data[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / data.length);
      setLevel(Math.min(1, rms * 1.6));
    }, 100);
  }, [cleanupAll, handleStop, seriesId]);

  const onMicClick = useCallback(() => {
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
      : "شروع ضبط";

  return (
    <Card>
      <CardHeader>
        <CardTitle>ضبط زنده</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Button
            type="button"
            size="icon-lg"
            variant={recording ? "destructive" : "default"}
            onClick={onMicClick}
            disabled={uploading}
            aria-label={buttonLabel}
          >
            {uploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : recording ? (
              <Square className="size-5" />
            ) : (
              <Mic className="size-5" />
            )}
          </Button>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between text-sm tabular-nums">
              <span className="font-medium">{formatTimer(seconds)}</span>
              <span className="text-muted-foreground">
                {recording ? "در حال ضبط" : uploading ? "بارگذاری" : "آماده"}
              </span>
            </div>
            <Progress value={Math.round(level * 100)} />
          </div>
        </div>

        <LiveCaptions committed={committed} partial={partial} />

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
