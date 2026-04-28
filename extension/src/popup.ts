import {
  listSeries,
  listTags,
  suggestSeries,
  createSeries,
  type SeriesWithCount,
  type TagWithCount,
  type SeriesSuggestion,
} from "./lib/api";
import { getBackendUrl, setBackendUrl } from "./lib/storage";
import type {
  Broadcast,
  PopupToSW,
  StartPayload,
  StatusUpdate,
} from "./lib/messaging";

// ---------- state ----------

interface FormState {
  title: string;
  numSpeakers: string;
  meetingBrief: string;
  seriesId: string | null;
  tagIds: string[];
  withMic: boolean;
  newSeriesName: string;
}

const formState: FormState = {
  title: "",
  numSpeakers: "",
  meetingBrief: "",
  seriesId: null,
  tagIds: [],
  withMic: true,
  newSeriesName: "",
};

let captureStatus: StatusUpdate = { state: "idle" };
const captions: { committed: string[]; partial: string } = {
  committed: [],
  partial: "",
};
let seriesList: SeriesWithCount[] = [];
let tagsList: TagWithCount[] = [];
let suggestion: SeriesSuggestion | null = null;
let backendUrl = "";
let backendUrlDraft = "";
let backendSavedAt = 0;
let creatingSeries = false;
let activeTabId: number | null = null;
let activeTabUrl = "";

const root = document.getElementById("root")!;

// ---------- init ----------

(async () => {
  // Cache active tab eagerly. handleStart MUST call getMediaStreamId
  // synchronously after the click — any prior `await` exhausts the
  // ~1s user-gesture window and Chromium (Chrome + Edge) rejects with
  // "Permission dismissed".
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id != null) {
      activeTabId = tab.id;
      activeTabUrl = tab.url ?? "";
    }
  } catch {
    /* will surface as error on Start */
  }

  try {
    backendUrl = await getBackendUrl();
    backendUrlDraft = backendUrl;
  } catch {
    backendUrl = "http://localhost:8000";
    backendUrlDraft = backendUrl;
  }

  try {
    const resp = (await chrome.runtime.sendMessage({
      type: "GET_STATE",
    } satisfies PopupToSW)) as { status?: StatusUpdate } | undefined;
    if (resp?.status) captureStatus = resp.status;
  } catch {
    /* SW asleep — fine */
  }

  try {
    seriesList = await listSeries();
  } catch (e) {
    console.error(e);
  }
  try {
    tagsList = await listTags();
  } catch (e) {
    console.error(e);
  }
  render();
})();

// ---------- broadcasts ----------

chrome.runtime.onMessage.addListener((msg: Broadcast) => {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "STATUS") {
    captureStatus = msg.status;
    render();
  } else if (msg.type === "CAPTION") {
    if (msg.caption.kind === "committed") {
      if (msg.caption.text) captions.committed.push(msg.caption.text);
      if (captions.committed.length > 8) {
        captions.committed = captions.committed.slice(-8);
      }
      captions.partial = "";
    } else {
      captions.partial = msg.caption.text;
    }
    render();
  }
});

// ---------- suggestion debounce ----------

let suggestTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSuggest(): void {
  if (suggestTimer) clearTimeout(suggestTimer);
  const t = formState.title.trim();
  if (!t || formState.seriesId) {
    suggestion = null;
    render();
    return;
  }
  suggestTimer = setTimeout(async () => {
    try {
      suggestion = await suggestSeries(t);
    } catch {
      suggestion = null;
    }
    render();
  }, 350);
}

// ---------- helpers ----------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Partial<Record<string, unknown>>,
  children?: (Node | string | null | undefined)[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null) continue;
      if (k === "class") node.className = String(v);
      else if (k === "dataset" && typeof v === "object") {
        Object.assign(node.dataset, v as Record<string, string>);
      } else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(
          k.slice(2).toLowerCase(),
          v as EventListenerOrEventListenerObject,
        );
      } else if (k in node) {
        // @ts-expect-error dynamic assign
        node[k] = v;
      } else {
        node.setAttribute(k, String(v));
      }
    }
  }
  if (children) {
    for (const c of children) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
  }
  return node;
}

function formatTimer(total: number | undefined): string {
  const s = Math.max(0, Math.floor(total ?? 0));
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

// ---------- render dispatcher ----------

function render(): void {
  const recordingStates: StatusUpdate["state"][] = [
    "starting",
    "recording",
    "stopping",
    "uploading",
    "done",
    "error",
  ];
  const isRecording = recordingStates.includes(captureStatus.state);
  root.innerHTML = "";
  if (isRecording) renderRecording();
  else renderForm();
}

// ---------- form view ----------

function renderForm(): void {
  const container = el("div", { class: "col" });

  container.appendChild(el("h2", {}, ["دستیار جلسه"]));

  // title
  const titleField = el("div", { class: "field" }, [
    el("label", { htmlFor: "title" }, ["عنوان (اختیاری)"]),
    el("input", {
      type: "text",
      id: "title",
      value: formState.title,
      placeholder: "مثلاً: استندآپ تیم بک‌اند",
      oninput: (e: Event) => {
        formState.title = (e.target as HTMLInputElement).value;
        scheduleSuggest();
      },
    }),
  ]);
  container.appendChild(titleField);

  // num speakers
  const numField = el("div", { class: "field" }, [
    el("label", { htmlFor: "num" }, ["تعداد افراد"]),
    el("input", {
      type: "number",
      id: "num",
      min: "1",
      max: "32",
      value: formState.numSpeakers,
      placeholder: "خودکار",
      oninput: (e: Event) => {
        formState.numSpeakers = (e.target as HTMLInputElement).value;
      },
    }),
  ]);
  container.appendChild(numField);

  // brief
  const briefField = el("div", { class: "field" }, [
    el("label", { htmlFor: "brief" }, ["توضیح کوتاه و افراد حاضر (اختیاری)"]),
    el("textarea", {
      id: "brief",
      rows: 3,
      value: formState.meetingBrief,
      oninput: (e: Event) => {
        formState.meetingBrief = (e.target as HTMLTextAreaElement).value;
      },
    }),
  ]);
  container.appendChild(briefField);

  // series picker
  const seriesField = el("div", { class: "field" });
  seriesField.appendChild(el("label", {}, ["سری (اختیاری)"]));
  const seriesRow = el("div", { class: "row" });

  const seriesSelect = el("select", {
    onchange: (e: Event) => {
      const v = (e.target as HTMLSelectElement).value;
      formState.seriesId = v || null;
      suggestion = null;
      render();
    },
  });
  seriesSelect.appendChild(el("option", { value: "" }, ["— هیچ‌کدام —"]));
  for (const s of seriesList) {
    const opt = el("option", { value: s.id }, [s.name]);
    if (formState.seriesId === s.id) opt.selected = true;
    seriesSelect.appendChild(opt);
  }
  seriesRow.appendChild(seriesSelect);
  seriesField.appendChild(seriesRow);

  // new series inline
  const newRow = el("div", { class: "row", style: "margin-top:6px" }, [
    el("input", {
      type: "text",
      class: "flex-1",
      placeholder: "نام سری",
      value: formState.newSeriesName,
      oninput: (e: Event) => {
        formState.newSeriesName = (e.target as HTMLInputElement).value;
      },
    }),
    el(
      "button",
      {
        class: "secondary",
        disabled: !formState.newSeriesName.trim() || creatingSeries,
        onclick: handleCreateSeries,
      },
      [creatingSeries ? "..." : "+ سری جدید"],
    ),
  ]);
  seriesField.appendChild(newRow);

  if (suggestion && !formState.seriesId) {
    const s = suggestion;
    seriesField.appendChild(
      el(
        "button",
        {
          type: "button",
          class: "suggestion",
          onclick: () => {
            formState.seriesId = s.series_id;
            suggestion = null;
            render();
          },
        },
        [`پیشنهاد: «${s.name}» (تطابق ${Math.round(s.score)}%)`],
      ),
    );
  }
  container.appendChild(seriesField);

  // tags
  const tagsField = el("div", { class: "field" });
  tagsField.appendChild(el("label", {}, ["برچسب‌ها"]));
  if (tagsList.length === 0) {
    tagsField.appendChild(el("span", { class: "muted" }, ["برچسبی ثبت نشده"]));
  } else {
    const wrap = el("div", { class: "tags" });
    for (const t of tagsList) {
      const active = formState.tagIds.includes(t.id);
      wrap.appendChild(
        el(
          "button",
          {
            type: "button",
            class: `tag${active ? " active" : ""}`,
            onclick: () => {
              if (active) {
                formState.tagIds = formState.tagIds.filter((x) => x !== t.id);
              } else {
                formState.tagIds = [...formState.tagIds, t.id];
              }
              render();
            },
          },
          [t.name],
        ),
      );
    }
    tagsField.appendChild(wrap);
  }
  container.appendChild(tagsField);

  // mic toggle
  const micRow = el("label", { class: "checkbox-row" }, [
    el("input", {
      type: "checkbox",
      checked: formState.withMic,
      onchange: (e: Event) => {
        formState.withMic = (e.target as HTMLInputElement).checked;
      },
    }),
    el("span", {}, ["میکروفون من را نیز ضبط کن"]),
  ]);
  container.appendChild(micRow);

  // start button
  container.appendChild(
    el(
      "button",
      {
        style: "width:100%; margin-top:8px;",
        onclick: handleStart,
      },
      ["شروع ضبط"],
    ),
  );

  // backend url editor
  container.appendChild(el("div", { class: "hr" }));
  const backendField = el("div", { class: "field" });
  backendField.appendChild(el("label", {}, ["آدرس بک‌اند"]));
  const backendRow = el("div", { class: "row" }, [
    el("input", {
      type: "text",
      class: "flex-1",
      value: backendUrlDraft,
      oninput: (e: Event) => {
        backendUrlDraft = (e.target as HTMLInputElement).value;
      },
    }),
    el(
      "button",
      {
        class: "secondary",
        onclick: handleSaveBackend,
      },
      ["ذخیره"],
    ),
  ]);
  backendField.appendChild(backendRow);
  if (backendSavedAt && Date.now() - backendSavedAt < 2000) {
    backendField.appendChild(el("span", { class: "ok" }, ["ok"]));
  }
  container.appendChild(backendField);

  root.appendChild(container);
}

async function handleCreateSeries(): Promise<void> {
  const name = formState.newSeriesName.trim();
  if (!name) return;
  creatingSeries = true;
  render();
  try {
    const created = await createSeries({ name });
    formState.newSeriesName = "";
    formState.seriesId = created.id;
    seriesList = await listSeries();
  } catch (e) {
    console.error(e);
  } finally {
    creatingSeries = false;
    render();
  }
}

async function handleSaveBackend(): Promise<void> {
  const v = backendUrlDraft.trim();
  if (!v) return;
  try {
    await setBackendUrl(v);
    backendUrl = v;
    backendSavedAt = Date.now();
    render();
    setTimeout(() => {
      if (Date.now() - backendSavedAt >= 2000) render();
    }, 2100);
  } catch (e) {
    console.error(e);
  }
}

function handleStart(): void {
  if (activeTabId == null) {
    captureStatus = {
      state: "error",
      error: "هیچ تب فعالی پیدا نشد. پاپ‌آپ را روی تب جلسه باز کنید.",
    };
    render();
    return;
  }

  const tabId = activeTabId;
  const tabUrl = activeTabUrl;

  // CRITICAL: call getMediaStreamId synchronously inside the click handler
  // before ANY `await`. Chromium (Chrome + Edge) only honors the user-gesture
  // token for ~1s and any awaited promise resolution exhausts it, causing
  // "Permission dismissed". All async work (sendMessage, etc.) must come AFTER.
  chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
    if (chrome.runtime.lastError || !id) {
      const error =
        chrome.runtime.lastError?.message ?? "tabCapture failed";
      captureStatus = { state: "error", error };
      render();
      return;
    }
    void afterStreamId(id, tabUrl);
  });
}

async function afterStreamId(streamId: string, tabUrl: string): Promise<void> {
  const numSpeakers = formState.numSpeakers.trim()
    ? Math.max(1, Math.min(32, parseInt(formState.numSpeakers, 10) || 0)) ||
      null
    : null;
  const payload: StartPayload = {
    withMic: formState.withMic,
    title: formState.title.trim() || null,
    meetingBrief: formState.meetingBrief.trim() || null,
    numSpeakers,
    seriesId: formState.seriesId,
    tagIds: formState.tagIds,
  };

  const msg: PopupToSW = {
    type: "START_REQUEST",
    payload,
    streamId,
    tabUrl,
  };
  try {
    await chrome.runtime.sendMessage(msg);
  } catch (e) {
    console.error(e);
  }
  captureStatus = { state: "starting" };
  captions.committed = [];
  captions.partial = "";
  render();
}

// ---------- recording view ----------

function renderRecording(): void {
  const container = el("div", { class: "col" });

  const stateLabel = stateToPersian(captureStatus.state);
  container.appendChild(
    el("div", { style: "text-align:center" }, [
      el("span", { class: "muted" }, [stateLabel]),
    ]),
  );

  // timer
  container.appendChild(
    el("div", { class: "timer" }, [formatTimer(captureStatus.seconds)]),
  );

  // level
  const levelPct = Math.round(((captureStatus.level ?? 0) * 100));
  const levelBar = el("div", { class: "level" }, [
    el("div", {
      class: "level-fill",
      style: `width:${Math.max(0, Math.min(100, levelPct))}%`,
    }),
  ]);
  container.appendChild(levelBar);

  // captions
  const lastFour = captions.committed.slice(-4);
  const capWrap = el("div", { class: "captions" });
  for (const line of lastFour) {
    capWrap.appendChild(el("div", {}, [line]));
  }
  if (captions.partial) {
    capWrap.appendChild(el("div", { class: "partial" }, [captions.partial]));
  }
  if (lastFour.length === 0 && !captions.partial) {
    capWrap.appendChild(el("span", { class: "muted" }, ["..."]));
  }
  container.appendChild(capWrap);

  // tab url hint
  if (captureStatus.tabUrl) {
    container.appendChild(
      el("div", { class: "muted" }, [captureStatus.tabUrl]),
    );
  }

  // state-specific footer
  if (captureStatus.state === "error") {
    container.appendChild(
      el("div", { class: "error" }, [
        `خطا: ${captureStatus.error ?? "نامشخص"}`,
      ]),
    );
    container.appendChild(
      el(
        "button",
        { class: "secondary", onclick: handleReset },
        ["بازنشانی"],
      ),
    );
  } else if (captureStatus.state === "done") {
    container.appendChild(el("div", { class: "ok" }, ["ضبط آماده شد"]));
    if (captureStatus.meetingId) {
      const id = captureStatus.meetingId;
      container.appendChild(
        el(
          "button",
          {
            onclick: () => {
              chrome.tabs.create({
                url: `http://localhost:3000/meetings/${id}`,
              });
            },
          },
          ["باز کردن جلسه"],
        ),
      );
    }
    container.appendChild(
      el(
        "button",
        { class: "secondary", onclick: handleReset },
        ["بازنشانی"],
      ),
    );
  } else if (
    captureStatus.state === "uploading" ||
    captureStatus.state === "stopping"
  ) {
    container.appendChild(
      el("div", { class: "muted" }, ["در حال بارگذاری..."]),
    );
  } else if (captureStatus.state === "starting") {
    container.appendChild(
      el("div", { class: "muted" }, ["در حال آماده‌سازی..."]),
    );
  } else {
    // recording — show stop
    container.appendChild(
      el(
        "button",
        { class: "danger", onclick: handleStop },
        ["توقف ضبط"],
      ),
    );
  }

  root.appendChild(container);
}

function stateToPersian(s: StatusUpdate["state"]): string {
  switch (s) {
    case "starting":
      return "در حال آماده‌سازی...";
    case "recording":
      return "در حال ضبط";
    case "stopping":
      return "در حال توقف...";
    case "uploading":
      return "در حال بارگذاری...";
    case "done":
      return "ضبط آماده شد";
    case "error":
      return "خطا";
    default:
      return "";
  }
}

async function handleStop(): Promise<void> {
  const msg: PopupToSW = { type: "STOP_REQUEST" };
  try {
    await chrome.runtime.sendMessage(msg);
  } catch (e) {
    console.error(e);
  }
}

async function handleReset(): Promise<void> {
  const msg: PopupToSW = { type: "STOP_REQUEST" };
  try {
    await chrome.runtime.sendMessage(msg);
  } catch (e) {
    console.error(e);
  }
  captureStatus = { state: "idle" };
  captions.committed = [];
  captions.partial = "";
  render();
}
