import type {
  Broadcast,
  PopupToSW,
  StartPayload,
  StatusUpdate,
  SWToOffscreen,
} from "./lib/messaging";

let lastStatus: StatusUpdate = { state: "idle" };

async function ensureOffscreen(): Promise<void> {
  const ctxs = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (ctxs.length > 0) return;
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("src/offscreen.html"),
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Capture meeting tab audio for transcription",
  });
}

async function startCapture(
  streamId: string,
  payload: StartPayload,
  tabUrl: string,
): Promise<void> {
  await ensureOffscreen();
  const msg: SWToOffscreen = {
    type: "START",
    streamId,
    payload,
    tabUrl,
  };
  await chrome.runtime.sendMessage(msg);
}

chrome.runtime.onMessage.addListener(
  (msg: PopupToSW | Broadcast, _sender, sendResponse) => {
    if (msg.type === "START_REQUEST") {
      lastStatus = { state: "starting" };
      const starting: Broadcast = { type: "STATUS", status: lastStatus };
      void chrome.runtime.sendMessage(starting).catch(() => {});
      startCapture(msg.streamId, msg.payload, msg.tabUrl).catch(
        (e: unknown) => {
          const error = e instanceof Error ? e.message : String(e);
          lastStatus = { state: "error", error };
          const b: Broadcast = { type: "STATUS", status: lastStatus };
          void chrome.runtime.sendMessage(b).catch(() => {});
        },
      );
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === "STOP_REQUEST") {
      const stop: SWToOffscreen = { type: "STOP" };
      void chrome.runtime.sendMessage(stop).catch(() => {});
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === "GET_STATE") {
      sendResponse({ status: lastStatus });
      return false;
    }
    if (msg.type === "STATUS") {
      lastStatus = msg.status;
      return false;
    }
    return false;
  },
);
