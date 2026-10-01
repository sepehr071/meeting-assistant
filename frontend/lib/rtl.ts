const PERSIAN_RANGE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

export function isPersian(text: string): boolean {
  return PERSIAN_RANGE.test(text);
}

export function dirOf(text: string): "rtl" | "ltr" {
  return isPersian(text) ? "rtl" : "ltr";
}

export function formatJalali(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
