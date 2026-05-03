"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, MessagesSquare, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PanelHeader } from "@/components/panel-header";
import { getSummary, type SummaryRead } from "@/lib/api";
import { dirOf } from "@/lib/rtl";

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("404 ");
}

export function QAView({ meetingId }: { meetingId: string }) {
  const { data, isLoading, isError, error } = useQuery<SummaryRead>({
    queryKey: ["summary", meetingId],
    queryFn: () => getSummary(meetingId),
    retry: false,
  });

  if (isLoading) {
    return (
      <>
        <PanelHeader kicker="پرسش و پاسخ" title="…" />
        <div className="space-y-3">
          <div className="h-24 rounded-xl animate-shimmer" />
          <div className="h-24 rounded-xl animate-shimmer" />
        </div>
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
        title="خطا در بارگذاری پرسش و پاسخ"
        tone="destructive"
      />
    );
  }

  const items = data?.qa ?? [];
  if (items.length === 0) {
    return (
      <>
        <PanelHeader kicker="پرسش و پاسخ" title="پرسشی ثبت نشد" />
        <EmptyState
          icon={MessagesSquare}
          title="سؤالی در این جلسه ثبت نشد"
          hint="هیچ سؤال صریحی در طول گفتگو شناسایی نشد."
        />
      </>
    );
  }

  return (
    <>
      <PanelHeader
        kicker="پرسش و پاسخ"
        title={`${items.length.toLocaleString("fa-IR")} پرسش پاسخ داده شد`}
      />
      <div className="flex flex-col gap-3">
        {items.map((qa, i) => (
          <article
            key={i}
            className="overflow-hidden rounded-2xl border border-line bg-surface"
          >
            <div className="px-6 pb-2.5 pt-5">
              <p
                dir={dirOf(qa.question)}
                className="text-[15px] font-semibold leading-7 text-ink"
              >
                {qa.question}
              </p>
            </div>
            <div className="border-t border-dashed border-line-soft px-6 pb-5 pt-4">
              {qa.answer ? (
                <div className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
                    <Sparkles className="size-3" />
                  </span>
                  <p
                    dir={dirOf(qa.answer)}
                    className="text-[13.5px] leading-7 text-ink-2"
                  >
                    {qa.answer}
                  </p>
                </div>
              ) : (
                <p className="italic text-[13px] text-ink-4">بی‌پاسخ ماند</p>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
