"use client";

import { useQuery } from "@tanstack/react-query";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
        <CardContent className="space-y-2 py-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/5" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    if (isNotFound(error)) {
      return (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            رونوشت هنوز آماده نیست
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-destructive">
          خطا در بارگذاری رونوشت
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardContent>
        <div
          dir="rtl"
          className="text-sm leading-7 whitespace-pre-wrap"
        >
          {data.plain_text?.trim() || "رونوشت خالی است"}
        </div>
      </CardContent>
    </Card>
  );
}
