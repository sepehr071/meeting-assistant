export type MeetingStatus =
  | "uploaded"
  | "transcribing"
  | "summarizing"
  | "done"
  | "failed";

export interface Meeting {
  id: string;
  title: string | null;
  status: MeetingStatus;
  original_filename: string;
  language: string;
  duration_s: number | null;
  num_speakers: number | null;
  meeting_brief: string | null;
  series_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type EmailTone = "formal" | "casual";

export interface Series {
  id: string;
  name: string;
  email_tone: EmailTone;
  created_at: string;
  updated_at: string;
}

export interface SeriesWithCount extends Series {
  meeting_count: number;
}

export interface SeriesSuggestion {
  series_id: string;
  name: string;
  score: number;
}

export interface Tag {
  id: string;
  name: string;
  created_at: string;
}

export interface TagWithCount extends Tag {
  meeting_count: number;
}

export type KeytermSource = "manual" | "suggested" | "accepted";

export interface KeyTerm {
  id: string;
  series_id: string;
  term: string;
  source: KeytermSource;
  created_at: string;
}

export interface SpeakerInfo {
  speaker_id: string;
  display_name: string | null;
}

export interface MeetingDetail extends Meeting {
  speakers: SpeakerInfo[];
  latest_summary_id: string | null;
  series: Series | null;
  tags: Tag[];
}

export interface ActionItem {
  text: string;
  owner: string | null;
  due_date: string | null;
}

export interface MinutesSegment {
  speaker_id: string;
  text: string;
  start_s: number;
  end_s: number;
}

export interface QAItem {
  question: string;
  answer: string | null;
}

export interface OpenQuestion {
  question: string;
  owner: string | null;
}

export interface EmailDraft {
  subject: string | null;
  body: string | null;
  tone: string | null;
}

export interface SummaryRead {
  id: string;
  meeting_id: string;
  model: string;
  exec_summary: string;
  action_items: ActionItem[];
  decisions: string[];
  minutes: MinutesSegment[];
  qa: QAItem[];
  open_questions: OpenQuestion[];
  email: EmailDraft | null;
  speakers: Record<string, SpeakerInfo>;
  created_at: string;
}

export interface TranscriptRead {
  meeting_id: string;
  plain_text: string;
  words: Array<Record<string, unknown>>;
}

export interface RealtimeToken {
  token: string;
  expires_at: string | null;
  keyterms: string[];
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface UploadMeetingOptions {
  title?: string | null;
  num_speakers?: number | null;
  meeting_brief?: string | null;
  series_id?: string | null;
  tag_ids?: string[];
  filename?: string;
}

export async function uploadMeeting(
  file: File | Blob,
  opts: UploadMeetingOptions = {},
): Promise<Meeting> {
  const fd = new FormData();
  const fname =
    opts.filename ??
    (file instanceof File ? file.name : "recording.webm");
  fd.append("file", file, fname);
  if (opts.title) fd.append("title", opts.title);
  if (opts.num_speakers != null && opts.num_speakers > 0) {
    fd.append("num_speakers", String(opts.num_speakers));
  }
  if (opts.meeting_brief && opts.meeting_brief.trim()) {
    fd.append("meeting_brief", opts.meeting_brief.trim());
  }
  if (opts.series_id) fd.append("series_id", opts.series_id);
  for (const tid of opts.tag_ids ?? []) fd.append("tag_ids", tid);
  return request<Meeting>("/meetings/upload", { method: "POST", body: fd });
}

export interface MeetingFilters {
  series_id?: string | null;
  tag_ids?: string[];
  q?: string | null;
}

export const listMeetings = (filters?: MeetingFilters): Promise<Meeting[]> => {
  const params = new URLSearchParams();
  if (filters?.series_id) params.set("series_id", filters.series_id);
  if (filters?.q && filters.q.trim()) params.set("q", filters.q.trim());
  for (const tid of filters?.tag_ids ?? []) params.append("tag_ids", tid);
  const qs = params.toString();
  return request(qs ? `/meetings?${qs}` : "/meetings");
};

export const getMeeting = (id: string): Promise<MeetingDetail> =>
  request(`/meetings/${id}`);

export const patchMeeting = (
  id: string,
  patch: { title?: string | null; series_id?: string | null; tag_ids?: string[] | null },
): Promise<MeetingDetail> =>
  request(`/meetings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

export const suggestSeries = (title: string): Promise<SeriesSuggestion | null> => {
  const params = new URLSearchParams({ title });
  return request(`/meetings/suggest-series?${params.toString()}`);
};

export const getSummary = (id: string): Promise<SummaryRead> =>
  request(`/meetings/${id}/summary`);
export const getTranscript = (id: string): Promise<TranscriptRead> =>
  request(`/meetings/${id}/transcript`);

export const renameSpeaker = (
  id: string,
  speakerId: string,
  displayName: string,
): Promise<SpeakerInfo> =>
  request(`/meetings/${id}/speakers/${speakerId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ display_name: displayName }),
  });

export const regenerate = (id: string): Promise<SummaryRead> =>
  request(`/meetings/${id}/regenerate-summary`, { method: "POST" });

export const cancelMeeting = (
  id: string,
): Promise<{ cancelled: boolean; signalled: boolean }> =>
  request(`/meetings/${id}/cancel`, { method: "POST" });

export const CANCELLED_SENTINEL = "cancelled by user";

export const getRealtimeToken = (
  seriesId?: string | null,
): Promise<RealtimeToken> =>
  request("/realtime/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ series_id: seriesId ?? null }),
  });

// Series

export const listSeries = (): Promise<SeriesWithCount[]> => request("/series");

export const createSeries = (input: {
  name: string;
  email_tone?: EmailTone;
}): Promise<Series> =>
  request("/series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email_tone: "formal", ...input }),
  });

export const updateSeries = (
  id: string,
  patch: { name?: string; email_tone?: EmailTone },
): Promise<Series> =>
  request(`/series/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

export const deleteSeries = async (id: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/series/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
};

export const listKeyterms = (
  seriesId: string,
  source?: KeytermSource,
): Promise<KeyTerm[]> => {
  const params = new URLSearchParams();
  if (source) params.set("source", source);
  const qs = params.toString();
  return request(
    `/series/${seriesId}/keyterms${qs ? `?${qs}` : ""}`,
  );
};

export const addKeyterm = (seriesId: string, term: string): Promise<KeyTerm> =>
  request(`/series/${seriesId}/keyterms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ term }),
  });

export const acceptKeyterm = (
  seriesId: string,
  termId: string,
): Promise<KeyTerm> =>
  request(`/series/${seriesId}/keyterms/${termId}/accept`, { method: "POST" });

export const rejectKeyterm = async (
  seriesId: string,
  termId: string,
): Promise<void> => {
  const res = await fetch(
    `${API_BASE}/series/${seriesId}/keyterms/${termId}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 204) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
};

export const listSeriesSpeakerNames = (seriesId: string): Promise<string[]> =>
  request(`/series/${seriesId}/speaker-names`);

// Tags

export const listTags = (): Promise<TagWithCount[]> => request("/tags");

export const createTag = (name: string): Promise<Tag> =>
  request("/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

export const deleteTag = async (id: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/tags/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
};

export function streamSummary(
  id: string,
  onDelta: (delta: string) => void,
  onDone?: () => void,
): EventSource {
  const es = new EventSource(`${API_BASE}/meetings/${id}/summary/stream`);
  es.onmessage = (e) => {
    if (e.data === "[DONE]") {
      es.close();
      onDone?.();
      return;
    }
    onDelta(e.data);
  };
  es.onerror = () => es.close();
  return es;
}

// Chat

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export const listChatMessages = (id: string): Promise<ChatMessage[]> =>
  request(`/meetings/${id}/chat/messages`);

export async function clearChatMessages(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/meetings/${id}/chat/messages`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
}

export function streamChatAsk(
  id: string,
  message: string,
  onDelta: (text: string) => void,
  onDone: (assistantId: string) => void,
  onError: (msg: string) => void,
): () => void {
  const ac = new AbortController();

  (async () => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/meetings/${id}/chat/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ message }),
        signal: ac.signal,
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      onError((err as Error)?.message ?? "خطای شبکه");
      return;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      onError(`${res.status} ${res.statusText}: ${text}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onError("پاسخ قابل خواندن نیست");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Split on SSE event boundaries (\n\n)
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            let evt: { type: string; text?: string; id?: string; message?: string };
            try {
              evt = JSON.parse(raw);
            } catch {
              continue;
            }
            if (evt.type === "delta" && typeof evt.text === "string") {
              onDelta(evt.text);
            } else if (evt.type === "done") {
              onDone(evt.id ?? "");
            } else if (evt.type === "error") {
              onError(evt.message ?? "خطای ناشناخته");
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      onError((err as Error)?.message ?? "خطا در خواندن جریان");
    } finally {
      reader.releaseLock();
    }
  })();

  return () => ac.abort();
}
