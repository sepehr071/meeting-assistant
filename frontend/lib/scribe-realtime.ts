export type CaptionEvent =
  | { type: "partial"; text: string }
  | { type: "committed"; text: string }
  | { type: "error"; error: string };

export interface ScribeRealtimeOptions {
  token: string;
  languageCode?: string;
  sampleRate?: number;
  vadSilenceSec?: number;
  keyterms?: string[];
  onEvent: (e: CaptionEvent) => void;
  onClose?: () => void;
}

const ENDPOINT_BASE = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";

export class ScribeRealtimeClient {
  private ws: WebSocket | null = null;
  private opts: ScribeRealtimeOptions;
  private closed = false;

  constructor(opts: ScribeRealtimeOptions) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    const params = new URLSearchParams({
      token: this.opts.token,
      model_id: "scribe_v2_realtime",
      language_code: this.opts.languageCode ?? "fas",
      commit_strategy: "vad",
      vad_silence_threshold_secs: String(this.opts.vadSilenceSec ?? 1.5),
      include_timestamps: "false",
    });
    const REALTIME_KEYTERM_LIMIT = 50;
    const REALTIME_KEYTERM_MAX_CHARS = 20;
    const keyterms = (this.opts.keyterms ?? [])
      .map((k) => k.trim())
      .filter((k) => k.length > 0 && k.length <= REALTIME_KEYTERM_MAX_CHARS)
      .slice(0, REALTIME_KEYTERM_LIMIT);
    for (const term of keyterms) {
      params.append("keyterms", term);
    }
    const url = `${ENDPOINT_BASE}?${params.toString()}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    return new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onErrorOnce);
        resolve();
      };

      const onErrorOnce = (ev: Event) => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onErrorOnce);
        reject(new Error(`WebSocket connection failed: ${String(ev.type)}`));
      };

      ws.addEventListener("open", onOpen);
      ws.addEventListener("error", onErrorOnce);

      ws.addEventListener("message", (ev) => this.handleMessage(ev));

      ws.addEventListener("error", () => {
        if (this.closed) return;
        this.opts.onEvent({ type: "error", error: "websocket error" });
      });

      ws.addEventListener("close", () => {
        this.closed = true;
        this.opts.onClose?.();
      });
    });
  }

  private handleMessage(ev: MessageEvent): void {
    if (typeof ev.data !== "string") return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(ev.data) as Record<string, unknown>;
    } catch {
      return;
    }

    const messageType =
      (msg.message_type as string | undefined) ??
      (msg.type as string | undefined) ??
      (msg.event as string | undefined) ??
      "";

    const errorTypeRaw = msg.error_type ?? msg.error;
    if (
      errorTypeRaw ||
      messageType.toLowerCase().includes("error") ||
      messageType === "auth_error" ||
      messageType === "input_error"
    ) {
      const errStr =
        typeof errorTypeRaw === "string"
          ? errorTypeRaw
          : JSON.stringify(msg);
      console.error("[scribe-realtime] server error:", ev.data);
      this.opts.onEvent({ type: "error", error: errStr });
      return;
    }

    if (messageType === "session_started" || messageType === "ready") {
      console.log("[scribe-realtime] session started");
      return;
    }

    const text =
      (msg.text as string | undefined) ??
      (msg.transcript as string | undefined) ??
      "";

    if (
      messageType === "partial_transcript" ||
      messageType === "partial" ||
      messageType.startsWith("partial")
    ) {
      this.opts.onEvent({ type: "partial", text });
      return;
    }

    if (
      messageType === "committed_transcript" ||
      messageType === "committed_transcript_with_timestamps" ||
      messageType === "committed" ||
      messageType.startsWith("committed")
    ) {
      this.opts.onEvent({ type: "committed", text });
      return;
    }
  }

  sendChunk(audio_base_64: string): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const payload = {
      message_type: "input_audio_chunk",
      audio_base_64,
      sample_rate: this.opts.sampleRate ?? 16000,
      commit: false,
    };
    try {
      ws.send(JSON.stringify(payload));
    } catch (err) {
      console.error("[scribe-realtime] send failed:", err);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
}
