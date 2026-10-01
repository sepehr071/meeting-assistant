"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  ChevronLeft,
  CircleCheckBig,
  ListChecks,
} from "lucide-react";

import {
  getActionItemsDigest,
  getStats,
  type ActionItemDigest,
  type Stats,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { dirOf, formatJalali } from "@/lib/rtl";

const DONE_KEY = "ma-done-actions";

function toFa(n: number): string {
  return n.toLocaleString("fa-IR");
}

function formatHours(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${toFa(h)}:${m.toLocaleString("fa-IR", { minimumIntegerDigits: 2 })}`;
}

function keyOf(it: ActionItemDigest): string {
  return `${it.meeting_id}::${it.text}`;
}

function isOverdue(due: string | null): boolean {
  if (!due) return false;
  const t = new Date(due).getTime();
  if (Number.isNaN(t)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return t < today.getTime();
}

function loadDone(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DONE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function StatsStrip() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ["stats", 7],
    queryFn: () => getStats(7),
    staleTime: 60_000,
  });
  const { data: digest, isLoading: digestLoading } = useQuery<ActionItemDigest[]>({
    queryKey: ["action-digest", 30],
    queryFn: () => getActionItemsDigest(30, 12),
    staleTime: 60_000,
  });

  // localStorage-persisted "done" set (no backend completion state on action
  // items). Hydrated in an effect to avoid SSR mismatch.
  const [done, setDone] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only hydration
    setDone(loadDone());
  }, []);

  const [expanded, setExpanded] = useState(false);

  function toggle(k: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      try {
        window.localStorage.setItem(DONE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore quota / private-mode errors */
      }
      return next;
    });
  }

  const meetings = stats?.meetings ?? 0;
  const hours = stats ? formatHours(stats.duration_s) : formatHours(0);
  const actions = stats?.actions ?? 0;
  const decisions = stats?.decisions ?? 0;

  // Server already sorts by due/recency; here we just float done items down.
  const rows = useMemo(() => {
    const items = digest ?? [];
    return items
      .map((it) => ({ it, k: keyOf(it) }))
      .sort((a, b) => Number(done.has(a.k)) - Number(done.has(b.k)));
  }, [digest, done]);

  const openCount = rows.filter((r) => !done.has(r.k)).length;

  // Keep the home page compact: show a few rows by default, expand on demand
  // (no nested scroll). Done items already sink to the bottom, so the visible
  // slice is the most relevant open/soonest-due work.
  const VISIBLE = 4;
  const shown = expanded ? rows : rows.slice(0, VISIBLE);
  const hasMore = rows.length > VISIBLE;

  return (
    <section
      className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface"
      dir="rtl"
      aria-label="نمای کلی هفته و اقدامات"
    >
      {/* weekly summary band */}
      <div className="border-b border-line-soft">
        <div className="flex items-center gap-2 px-4 pt-3">
          <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
          <span className="text-[11px] font-semibold text-brand-ink">
            این هفته
          </span>
          <span className="ms-auto text-[11px] text-ink-4">۷ روز اخیر</span>
        </div>
        <div className="grid grid-cols-4 pb-1">
          <StatCell label="جلسه" value={toFa(meetings)} delta={stats?.meetings_delta} />
          <StatCell
            label="ساعت"
            value={hours}
            mono
            delta={stats?.duration_delta_s}
            deltaKind="hours"
            divided
          />
          <StatCell label="اقدام" value={toFa(actions)} divided />
          <StatCell label="تصمیم" value={toFa(decisions)} divided />
        </div>
      </div>

      {/* action digest */}
      <header className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-brand" />
          <h3 className="text-[12.5px] font-semibold text-ink-2">
            اقدامات پیشِ‌رو
          </h3>
          {openCount > 0 && (
            <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-ink">
              {toFa(openCount)}
            </span>
          )}
        </div>
        <span className="text-[11px] text-ink-4">۳۰ روز اخیر</span>
      </header>

      {digestLoading ? (
        <div className="space-y-px">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-shimmer" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2.5 px-6 py-9 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-brand-soft text-brand">
            <CircleCheckBig className="size-5" />
          </span>
          <p className="text-[13px] font-medium text-ink">
            اقدام باز برای پیگیری نیست
          </p>
          <p className="text-[11.5px] text-ink-3">
            اقدام‌های جلسه‌های اخیر این‌جا فهرست می‌شوند.
          </p>
        </div>
      ) : (
        <>
          <ul>
            {shown.map(({ it, k }) => {
              const isDone = done.has(k);
              const overdue = !isDone && isOverdue(it.due_date);
              return (
                <li
                  key={k}
                  className={cn(
                    "flex items-start gap-3 border-b border-line-soft px-4 py-3 last:border-0",
                    isDone && "opacity-55",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggle(k)}
                    aria-label={isDone ? "علامت ناتمام" : "علامت انجام‌شده"}
                    className="group/check -my-2.5 -ms-2.5 grid size-9 shrink-0 place-items-center rounded-lg sm:m-0 sm:mt-0.5 sm:size-[18px]"
                  >
                    <span
                      className={cn(
                        "grid size-[18px] place-items-center rounded-md border transition-colors",
                        isDone
                          ? "border-success bg-success text-white"
                          : "border-line-soft bg-surface text-ink-4 group-hover/check:border-ink-4",
                      )}
                    >
                      {isDone && (
                        <svg
                          viewBox="0 0 12 12"
                          className="size-2.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2.5 6.5l2.5 2.5 4.5-5" />
                        </svg>
                      )}
                    </span>
                  </button>

                  <Link
                    href={`/meetings/${it.meeting_id}`}
                    className="group min-w-0 flex-1"
                  >
                    <p
                      dir={dirOf(it.text)}
                      className={cn(
                        "text-[13.5px] font-medium leading-6 text-ink",
                        isDone && "text-ink-3 line-through",
                      )}
                    >
                      {it.text}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-4">
                      {it.owner && (
                        <span dir={dirOf(it.owner)} className="text-ink-3">
                          {it.owner}
                        </span>
                      )}
                      {it.due_date && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 font-mono tabular-nums",
                            overdue && "font-semibold text-destructive",
                          )}
                        >
                          <CalendarClock className="size-3" />
                          {formatJalali(it.due_date)}
                          {overdue && " · گذشته"}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-0.5 text-ink-4 transition-colors group-hover:text-brand">
                        <ChevronLeft className="size-3" />
                        {it.meeting_title?.trim() || "مشاهده جلسه"}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full border-t border-line-soft py-2.5 text-[12px] font-medium text-brand transition-colors hover:bg-bg-soft"
            >
              {expanded ? "نمایش کمتر" : `نمایش همه (${toFa(rows.length)})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function StatCell({
  label,
  value,
  mono,
  delta,
  deltaKind,
  divided,
}: {
  label: string;
  value: string;
  mono?: boolean;
  delta?: number;
  deltaKind?: "hours";
  divided?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 px-3 py-3 sm:px-4",
        divided && "border-s border-line-soft",
      )}
    >
      <span className="text-[11px] font-medium text-ink-3">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-[22px] font-bold leading-none text-ink sm:text-[26px]",
            mono && "font-mono tabular-nums",
          )}
        >
          {value}
        </span>
        {delta !== undefined && <Delta value={delta} kind={deltaKind} />}
      </div>
    </div>
  );
}

function Delta({ value, kind }: { value: number; kind?: "hours" }) {
  if (!value) {
    return <span className="text-[10px] text-ink-4">—</span>;
  }
  const up = value > 0;
  const mag =
    kind === "hours" ? formatHours(Math.abs(value)) : toFa(Math.abs(value));
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        up ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
      )}
    >
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {mag}
    </span>
  );
}
