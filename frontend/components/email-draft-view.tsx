"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Copy, FileText, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PanelHeader } from "@/components/panel-header";
import { getMeeting, getSummary, type MeetingDetail, type SummaryRead } from "@/lib/api";
import { dirOf } from "@/lib/rtl";

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("404 ");
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("کپی شد");
  } catch {
    toast.error("کپی ناموفق");
  }
}

export function EmailDraftView({ meetingId }: { meetingId: string }) {
  const { data, isLoading, isError, error } = useQuery<SummaryRead>({
    queryKey: ["summary", meetingId],
    queryFn: () => getSummary(meetingId),
    retry: false,
  });

  const meetingQ = useQuery<MeetingDetail>({
    queryKey: ["meeting", meetingId],
    queryFn: () => getMeeting(meetingId),
  });

  if (isLoading) {
    return (
      <>
        <PanelHeader kicker="پیش‌نویس ایمیل" title="…" />
        <div className="space-y-2">
          <div className="h-8 rounded animate-shimmer" />
          <div className="h-32 rounded animate-shimmer" />
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
        title="خطا در بارگذاری ایمیل"
        tone="destructive"
      />
    );
  }

  const email = data?.email;
  if (!email || (!email.subject && !email.body)) {
    return (
      <>
        <PanelHeader kicker="پیش‌نویس ایمیل" title="پیش‌نویسی تولید نشد" />
        <EmptyState
          icon={Mail}
          title="پیش‌نویس ایمیل تولید نشد"
          hint="جلسه‌ی کوتاه یا بدون اقدام مشخص — مدل پیش‌نویسی پیشنهاد نکرد."
        />
      </>
    );
  }

  const fullEmail = `${email.subject ?? ""}\n\n${email.body ?? ""}`.trim();
  const toneLabel = email.tone === "casual" ? "خودمانی" : "رسمی";
  const seriesName = meetingQ.data?.series?.name;
  const subtitle = seriesName
    ? `بازنویسی شده برای لحن سری «${seriesName}» — ${toneLabel}`
    : `لحن: ${toneLabel}`;

  return (
    <>
      <PanelHeader
        kicker="پیش‌نویس ایمیل"
        title="پیش‌نویس آماده ارسال"
        subtitle={subtitle}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => copy(fullEmail)}
            className="gap-1.5 border-line"
          >
            <Copy className="size-3.5" />
            کپی کامل
          </Button>
        }
      />

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {email.subject && (
          <div className="border-b border-line-soft px-6 py-4">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-ink-4">
              موضوع
            </p>
            <p
              dir={dirOf(email.subject)}
              className="text-[15px] font-semibold leading-7 text-ink"
            >
              {email.subject}
            </p>
          </div>
        )}
        {email.body && (
          <div className="px-6 py-5">
            <pre
              dir={dirOf(email.body)}
              className="whitespace-pre-wrap font-sans text-sm leading-[2] text-ink-2"
            >
              {email.body}
            </pre>
          </div>
        )}
      </div>
    </>
  );
}
