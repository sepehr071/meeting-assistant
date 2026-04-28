const KEY_BACKEND_URL = "backendUrl";
const DEFAULT_BACKEND_URL = "http://localhost:8000";

export async function getBackendUrl(): Promise<string> {
  const out = await chrome.storage.local.get(KEY_BACKEND_URL);
  const v = out[KEY_BACKEND_URL];
  return typeof v === "string" && v.trim() ? v.trim() : DEFAULT_BACKEND_URL;
}

export async function setBackendUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ [KEY_BACKEND_URL]: url });
}
