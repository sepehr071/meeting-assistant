import { CANCELLED_SENTINEL } from "@/lib/api";

/**
 * Maps a raw backend failure message (which may be a full Python traceback with
 * file paths and stack frames) to a safe, user-facing Persian sentence. The raw
 * text is NEVER returned — it can leak internal paths and implementation detail.
 * Use everywhere a `Meeting.error_message` would otherwise be rendered.
 */
export function friendlyMeetingError(raw: string | null | undefined): string {
  if (raw === CANCELLED_SENTINEL) {
    return "پردازش توسط شما متوقف شد.";
  }
  const msg = (raw ?? "").toLowerCase();
  if (!msg.trim()) {
    return "پردازش این جلسه ناموفق بود.";
  }
  // Network / connectivity (covers "Server disconnected without sending a
  // response", proxy/timeout/SSL errors from the egress tunnel).
  if (
    /(timeout|timed out|disconnect|connection|connect|network|proxy|unreachable|ssl|502|503|504)/.test(
      msg,
    )
  ) {
    return "ارتباط با سرویس پردازش برقرار نشد. لطفاً کمی بعد دوباره تلاش کنید.";
  }
  // Transcription (Scribe / ElevenLabs / audio handling).
  if (/(scribe|transcri|elevenlabs|audio|ffprobe|diariz|codec)/.test(msg)) {
    return "رونویسی صدا ناموفق بود. ممکن است فایل صوتی خراب یا ناپشتیبان باشد.";
  }
  // Summarization (OpenRouter / LLM / schema).
  if (/(summar|openrouter|gemini|json|schema|\bllm\b|model)/.test(msg)) {
    return "خلاصه‌سازی جلسه ناموفق بود. لطفاً دوباره تلاش کنید.";
  }
  // File size / format / upload limits.
  if (/(too large|payload|413|unsupported|invalid file|file type)/.test(msg)) {
    return "حجم یا قالب فایل پشتیبانی نمی‌شود.";
  }
  return "پردازش این جلسه ناموفق بود. لطفاً دوباره تلاش کنید.";
}
