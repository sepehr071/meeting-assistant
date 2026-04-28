"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, AlertTriangle } from "lucide-react";

import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
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
        <CardContent className="space-y-2 py-5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
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

  return (
    <Card>
      <CardContent>
        <div
          dir="rtl"
          className="text-sm leading-8 whitespace-pre-wrap text-foreground/90"
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
