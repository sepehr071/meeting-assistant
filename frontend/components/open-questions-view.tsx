"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, HelpCircle } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PanelHeader } from "@/components/panel-header";
import { getSummary, type SummaryRead } from "@/lib/api";
import { dirOf } from "@/lib/rtl";

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("404 ");
}

export function OpenQuestionsView({ meetingId }: { meetingId: string }) {
  const { data, isLoading, isError, error } = useQuery<SummaryRead>({
    queryKey: ["summary", meetingId],
    queryFn: () => getSummary(meetingId),
    retry: false,
  });

  if (isLoading) {
    return (
      <>
        <PanelHeader kicker="مسائل باز" title="…" />
        <div className="h-20 rounded-xl animate-shimmer" />
      </>
    );
  }

  if (isError) {
    if (isNotFound(error)) {
      return <EmptyState icon={FileText} title="خلاصه هنوز آماده نیست" />;
    }
    return (
      <EmptyState
        icon={AlertTriangle}
        title="خطا در بارگذاری مسائل باز"
        tone="destructive"
      />
    );
  }

  const items = data?.open_questions ?? [];
  if (items.length === 0) {
    return (
      <>
        <PanelHeader kicker="مسائل باز" title="مسئله‌ی بازی ثبت نشد" />
        <EmptyState
          icon={HelpCircle}
          title="مسئله‌ی بازی ثبت نشد"
          hint="پرسش بدون پاسخی برای پیگیری شناسایی نشد."
        />
      </>
    );
  }

  return (
    <>
      <PanelHeader
        kicker="مسائل باز"
        title="پیگیری‌های لازم بعد از این جلسه"
      />
      <div className="flex flex-col gap-2.5">
        {items.map((q, i) => (
          <article
            key={i}
            className="flex items-start gap-3 rounded-xl border border-line bg-surface px-5 py-3.5"
          >
            <span
              className="grid size-6 shrink-0 place-items-center rounded-md"
              style={{
                background: "oklch(0.97 0.04 80)",
                color: "oklch(0.45 0.13 80)",
              }}
            >
              <AlertTriangle className="size-3.5" />
            </span>
            <p
              dir={dirOf(q.question)}
              className="flex-1 text-sm leading-7 text-ink"
            >
              {q.question}
            </p>
            {q.owner && (
              <span
                dir={dirOf(q.owner)}
                className="shrink-0 rounded-full bg-bg-soft px-2.5 py-0.5 text-[11px] text-ink-3"
              >
                {q.owner}
              </span>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
