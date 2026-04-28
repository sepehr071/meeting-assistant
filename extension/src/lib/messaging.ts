export interface StartPayload {
  withMic: boolean;
  title?: string | null;
  meetingBrief?: string | null;
  numSpeakers?: number | null;
  seriesId?: string | null;
  tagIds?: string[];
}

export type CaptureState =
  | "idle"
  | "starting"
  | "recording"
  | "stopping"
  | "uploading"
  | "done"
  | "error";

export interface StatusUpdate {
  state: CaptureState;
  seconds?: number;
  level?: number;
  meetingId?: string;
  error?: string;
  tabUrl?: string;
}

export interface CaptionUpdate {
  kind: "partial" | "committed";
  text: string;
}

// popup -> service_worker
export type PopupToSW =
  | {
      type: "START_REQUEST";
      payload: StartPayload;
      streamId: string;
      tabUrl: string;
    }
  | { type: "STOP_REQUEST" }
  | { type: "GET_STATE" };

// service_worker -> offscreen
export type SWToOffscreen =
  | { type: "START"; streamId: string; payload: StartPayload; tabUrl: string }
  | { type: "STOP" };

// offscreen / SW -> popup (broadcast via chrome.runtime.sendMessage)
export type Broadcast =
  | { type: "STATUS"; status: StatusUpdate }
  | { type: "CAPTION"; caption: CaptionUpdate };

export const MSG = {
  START_REQUEST: "START_REQUEST",
  STOP_REQUEST: "STOP_REQUEST",
  GET_STATE: "GET_STATE",
  START: "START",
  STOP: "STOP",
  STATUS: "STATUS",
  CAPTION: "CAPTION",
} as const;
