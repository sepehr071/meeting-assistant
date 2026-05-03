"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, Gavel } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PanelHeader } from "@/components/panel-header";
import { getSummary, type SummaryRead } from "@/lib/api";
import { dirOf } from "@/lib/rtl";

interface DecisionsViewProps {
  meetingId: string;
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("404 ");
}

export function DecisionsView({ meetingId }: DecisionsViewProps) {
  const { data, isLoading, isError, error } = useQuery<SummaryRead>({
    queryKey: ["summary", meetingId],
    queryFn: () => getSummary(meetingId),
    retry: false,
  });

  if (isLoading) {
    return (
      <>
        <PanelHeader kicker="تصمیم‌ها" title="…" />
        <div className="space-y-3">
          <div className="h-20 rounded-xl animate-shimmer" />
          <div className="h-20 rounded-xl animate-shimmer" />
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
        title="خطا در بارگذاری تصمیم‌ها"
        tone="destructive"
      />
    );
  }

  if (!data) return null;

  if (data.decisions.length === 0) {
    return (
      <>
        <PanelHeader kicker="تصمیم‌ها" title="تصمیمی استخراج نشد" />
        <EmptyState
          icon={Gavel}
          title="تصمیمی استخراج نشد"
          hint="هیچ تصمیم قطعی در این جلسه شناسایی نشد."
        />
      </>
    );
  }

  return (
    <>
      <PanelHeader
        kicker="تصمیم‌ها"
        title={`${data.decisions.length.toLocaleString(
          "fa-IR",
        )} نقطه عطف در این جلسه`}
      />
      <div className="flex flex-col gap-3.5">
        {data.decisions.map((d, i) => (
          <article
            key={i}
            className="grid grid-cols-[32px_1fr] gap-4 rounded-2xl border border-line bg-surface px-6 py-5"
          >
            <span
              className="grid size-7 place-items-center rounded-full text-xs font-bold text-white font-mono tabular-nums"
              style={{
                background:
                  "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)",
              }}
            >
              {(i + 1).toLocaleString("fa-IR")}
            </span>
            <p
              dir={dirOf(d)}
              className="text-base font-medium leading-7 tracking-tight text-ink"
            >
              {d}
            </p>
          </article>
        ))}
      </div>
    </>
  );
}
