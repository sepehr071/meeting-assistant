import { getBackendUrl } from "./storage";

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

export interface RealtimeToken {
  token: string;
  expires_at: string | null;
  keyterms: string[];
}

export interface UploadMeetingOptions {
  title?: string | null;
  num_speakers?: number | null;
  meeting_brief?: string | null;
  series_id?: string | null;
  tag_ids?: string[];
  filename?: string;
}

async function apiUrl(path: string): Promise<string> {
  const base = await getBackendUrl();
  return `${base.replace(/\/+$/, "")}/api${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = await apiUrl(path);
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const getRealtimeToken = (
  seriesId?: string | null,
): Promise<RealtimeToken> =>
  request("/realtime/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ series_id: seriesId ?? null }),
  });

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

export const listSeries = (): Promise<SeriesWithCount[]> => request("/series");

export const listTags = (): Promise<TagWithCount[]> => request("/tags");

export const suggestSeries = (
  title: string,
): Promise<SeriesSuggestion | null> => {
  const params = new URLSearchParams({ title });
  return request(`/meetings/suggest-series?${params.toString()}`);
};

export const createSeries = (input: {
  name: string;
  email_tone?: EmailTone;
}): Promise<Series> =>
  request("/series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email_tone: "formal", ...input }),
  });
