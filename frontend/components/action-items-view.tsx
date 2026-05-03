"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, FileText, ListChecks } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PanelHeader } from "@/components/panel-header";
import { getSummary, type SummaryRead } from "@/lib/api";
import { cn } from "@/lib/utils";
import { dirOf, formatJalali } from "@/lib/rtl";

interface ActionItemsViewProps {
  meetingId: string;
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("404 ");
}

export function ActionItemsView({ meetingId }: ActionItemsViewProps) {
  const { data, isLoading, isError, error } = useQuery<SummaryRead>({
    queryKey: ["summary", meetingId],
    queryFn: () => getSummary(meetingId),
    retry: false,
  });

  const [done, setDone] = useState<Set<number>>(new Set());

  const grouped = useMemo(() => {
    if (!data) return new Map<string, Array<{ idx: number; item: SummaryRead["action_items"][number] }>>();
    const m = new Map<string, Array<{ idx: number; item: SummaryRead["action_items"][number] }>>();
    data.action_items.forEach((item, idx) => {
      const key = item.owner?.trim() || "بدون مسئول";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push({ idx, item });
    });
    return m;
  }, [data]);

  if (isLoading) {
    return (
      <>
        <PanelHeader kicker="اقدامات" title="…" />
        <div className="space-y-2">
          <div className="h-16 rounded-xl animate-shimmer" />
          <div className="h-16 rounded-xl animate-shimmer" />
        </div>
      </>
    );
  }

  if (isError) {
    if (isNotFound(error)) {
      return (
        <EmptyState
          icon={FileText}
          title="خلاصه هنوز آماده نیست"
          hint="پس از پایان پردازش، اقدامات اینجا فهرست می‌شوند."
        />
      );
    }
    return (
      <EmptyState
        icon={AlertTriangle}
        title="خطا در بارگذاری موارد اقدام"
        tone="destructive"
      />
    );
  }

  if (!data) return null;

  const total = data.action_items.length;

  if (total === 0) {
    return (
      <>
        <PanelHeader
          kicker="اقدامات"
          title="در این جلسه اقدامی استخراج نشد"
        />
        <EmptyState
          icon={ListChecks}
          title="مورد اقدامی استخراج نشد"
          hint="در این جلسه وظیفه‌ی مشخصی برای پیگیری شناسایی نشد."
        />
      </>
    );
  }

  function toggle(idx: number) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  return (
    <>
      <PanelHeader
        kicker="اقدامات"
        title={`${total.toLocaleString("fa-IR")} مورد برای پیگیری`}
        subtitle={`${done.size.toLocaleString("fa-IR")} از ${total.toLocaleString(
          "fa-IR",
        )} انجام شده · ${(total - done.size).toLocaleString("fa-IR")} باقی‌مانده`}
      />

      <div className="space-y-6">
        {Array.from(grouped.entries()).map(([owner, items]) => (
          <div key={owner}>
            <div className="mb-2.5 flex items-center gap-2">
              <span
                className="grid size-5 place-items-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand-ink"
                aria-hidden="true"
              >
                {owner[0]}
              </span>
              <h3
                dir={dirOf(owner)}
                className="text-xs font-semibold tracking-wide text-ink-2"
              >
                {owner} · {items.length.toLocaleString("fa-IR")}
              </h3>
            </div>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {items.map(({ idx, item }, i) => {
                const isDone = done.has(idx);
                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-start gap-3 px-5 py-3.5 transition-opacity",
                      i < items.length - 1 && "border-b border-line-soft",
                      isDone && "opacity-55",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(idx)}
                      aria-label={isDone ? "علامت ناتمام" : "علامت انجام‌شده"}
                      className={cn(
                        "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-md border transition-colors",
                        isDone
                          ? "border-success bg-success text-white"
                          : "border-line-soft bg-surface text-ink-4 hover:border-ink-4",
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
                    </button>
                    <div className="flex-1">
                      <p
                        dir={dirOf(item.text)}
                        className={cn(
                          "text-sm font-medium leading-7 text-ink",
                          isDone && "line-through",
                        )}
                      >
                        {item.text}
                      </p>
                      {item.due_date && (
                        <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-ink-3">
                          <CalendarDays className="size-3" />
                          <span className="font-mono tabular-nums">
                            {formatJalali(item.due_date)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
