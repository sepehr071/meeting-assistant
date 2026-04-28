"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, ScrollText } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
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
      <Card>
        <CardContent className="space-y-2 py-5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </CardContent>
      </Card>
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

  return (
    <Card>
      <CardContent>
        <div
          dir="rtl"
          className="text-sm leading-8 whitespace-pre-wrap text-foreground/90"
        >
          {data.plain_text}
        </div>
      </CardContent>
    </Card>
  );
}
