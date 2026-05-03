"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, ScrollText } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PanelHeader } from "@/components/panel-header";
import { getTranscript, type TranscriptRead } from "@/lib/api";

interface TranscriptViewProps {
  meetingId: string;
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("404 ");
}

export function TranscriptView({ meetingId }: TranscriptViewProps) {
  const { data, isLoading, isError, error } = useQuery<TranscriptRead>({
    queryKey: ["transcript", meetingId],
    queryFn: () => getTranscript(meetingId),
    retry: false,
  });

  if (isLoading) {
    return (
      <>
        <PanelHeader kicker="رونوشت" title="…" />
        <div className="space-y-2">
          <div className="h-5 w-full rounded animate-shimmer" />
          <div className="h-5 w-5/6 rounded animate-shimmer" />
          <div className="h-5 w-4/5 rounded animate-shimmer" />
          <div className="h-5 w-3/5 rounded animate-shimmer" />
        </div>
      </>
    );
  }

  if (isError) {
    if (isNotFound(error)) {
      return <EmptyState icon={FileText} title="رونوشت هنوز آماده نیست" />;
    }
    return (
      <EmptyState
        icon={AlertTriangle}
        title="خطا در بارگذاری رونوشت"
        tone="destructive"
      />
    );
  }

  if (!data) return null;
  if (!data.plain_text?.trim()) {
    return <EmptyState icon={ScrollText} title="رونوشت خالی است" />;
  }

  const wordCount = data.plain_text.trim().split(/\s+/).length;

  return (
    <>
      <PanelHeader
        kicker="رونوشت"
        title="رونوشت کامل با گویندگان"
        subtitle={`${wordCount.toLocaleString("fa-IR")} کلمه`}
      />
      <div className="rounded-2xl border border-line bg-surface p-6">
        <pre
          dir="rtl"
          className="whitespace-pre-wrap font-sans text-[14px] leading-[2.1] text-ink"
        >
          {data.plain_text}
        </pre>
      </div>
    </>
  );
}
