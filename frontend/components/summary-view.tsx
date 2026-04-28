"use client";

import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSummary, type SummaryRead } from "@/lib/api";
import { formatJalali } from "@/lib/rtl";

interface SummaryViewProps {
  meetingId: string;
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("404 ");
}

export function SummaryView({ meetingId }: SummaryViewProps) {
  const { data, isLoading, isError, error } = useQuery<SummaryRead>({
    queryKey: ["summary", meetingId],
    queryFn: () => getSummary(meetingId),
    retry: false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-2 py-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    if (isNotFound(error)) {
      return (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            خلاصه هنوز آماده نیست
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-destructive">
          خطا در بارگذاری خلاصه
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
          className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-7"
        >
          {data.exec_summary?.trim() || "خلاصه‌ای ثبت نشد"}
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono">{data.model}</span>
        <span>{formatJalali(data.created_at)}</span>
      </CardFooter>
    </Card>
  );
}
