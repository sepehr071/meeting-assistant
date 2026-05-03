"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckSquare,
  CircleHelp,
  FileText,
  Gavel,
  Sparkles,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PanelHeader } from "@/components/panel-header";
import { getSummary, type SummaryRead } from "@/lib/api";
import { formatJalali } from "@/lib/rtl";

interface SummaryViewProps {
  meetingId: string;
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("404 ");
}

function firstSentence(text: string): string {
  const s = text.trim();
  const m = s.match(/^[^.!?؟]+[.!?؟]?/);
  if (!m) return s.slice(0, 120);
  return m[0].length < 6 ? s.slice(0, 120) : m[0];
}

function InsightTile({
  icon,
  bg,
  fg,
  value,
  label,
  sub,
}: {
  icon: React.ReactNode;
  bg: string;
  fg: string;
  value: number;
  label: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
      <span
        className="grid size-8 place-items-center rounded-lg"
        style={{ background: bg, color: fg }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div>
        <div className="text-[28px] font-bold leading-none tracking-tight text-ink">
          {value.toLocaleString("fa-IR")}
        </div>
        <div className="mt-1 text-[13px] font-medium text-ink">{label}</div>
        {sub && <div className="mt-0.5 text-[11.5px] text-ink-4">{sub}</div>}
      </div>
    </div>
  );
}

export function SummaryView({ meetingId }: SummaryViewProps) {
  const { data, isLoading, isError, error } = useQuery<SummaryRead>({
    queryKey: ["summary", meetingId],
    queryFn: () => getSummary(meetingId),
    retry: false,
  });

  if (isLoading) {
    return (
      <>
        <PanelHeader kicker="خلاصه اجرایی" title="…" />
        <div className="space-y-2">
          <div className="h-7 w-3/4 rounded animate-shimmer" />
          <div className="h-7 w-full rounded animate-shimmer" />
          <div className="h-7 w-5/6 rounded animate-shimmer" />
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
          hint="پس از پایان رونویسی و خلاصه‌سازی، نتیجه اینجا نمایش داده می‌شود."
        />
      );
    }
    return (
      <EmptyState
        icon={AlertTriangle}
        title="خطا در بارگذاری خلاصه"
        tone="destructive"
      />
    );
  }

  if (!data) return null;

  const exec = data.exec_summary?.trim() || "";
  const headline = exec ? firstSentence(exec) : "خلاصه‌ای از این جلسه";

  return (
    <>
      <PanelHeader kicker="خلاصه اجرایی" title={headline} />

      <div className="mb-6 flex items-center gap-2 text-xs text-ink-3" dir="rtl">
        <span
          className="grid size-[18px] place-items-center rounded-md text-white"
          style={{
            background:
              "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)",
          }}
        >
          <Sparkles className="size-2.5" />
        </span>
        <span>تولید شده توسط</span>
        <span className="font-mono text-ink-4">{data.model}</span>
        <span>·</span>
        <span>{formatJalali(data.created_at)}</span>
      </div>

      <div
        className="mb-7 rounded-2xl border border-line bg-surface p-6"
        dir="rtl"
      >
        {exec ? (
          <p className="whitespace-pre-wrap text-[14.5px] leading-[2.1] text-ink">
            {exec}
          </p>
        ) : (
          <p className="text-[13.5px] text-ink-4">خلاصه‌ای ثبت نشد.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InsightTile
          icon={<CheckSquare className="size-4" />}
          bg="oklch(0.96 0.04 155)"
          fg="oklch(0.62 0.14 155)"
          value={data.action_items.length}
          label="اقدام شناسایی شد"
          sub={
            data.action_items.length > 0
              ? `${data.action_items
                  .filter((a) => a.due_date)
                  .length.toLocaleString("fa-IR")} مورد با تاریخ مشخص`
              : undefined
          }
        />
        <InsightTile
          icon={<Gavel className="size-4" />}
          bg="var(--brand-soft)"
          fg="var(--brand)"
          value={data.decisions.length}
          label="تصمیم ثبت شد"
        />
        <InsightTile
          icon={<CircleHelp className="size-4" />}
          bg="oklch(0.97 0.04 80)"
          fg="oklch(0.55 0.15 80)"
          value={data.open_questions.length}
          label="مسئله باز"
          sub={
            data.open_questions.length > 0 ? "نیاز به پیگیری" : undefined
          }
        />
      </div>
    </>
  );
}
