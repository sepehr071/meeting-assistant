"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, FileText, ListChecks } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { getSummary, type SummaryRead } from "@/lib/api";
import { dirOf, formatJalali } from "@/lib/rtl";

interface ActionItemsViewProps {
  meetingId: string;
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("404 ");
}

export function ActionItemsView({ meetingId }: ActionItemsViewProps) {
  const { data, isLoading, isError, error } = useQuery<SummaryRead>({
    queryKey: ["summary", meetingId],
    queryFn: () => getSummary(meetingId),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (isError) {
    if (isNotFound(error)) {
      return (
        <EmptyState
          icon={FileText}
          title="خلاصه هنوز آماده نیست"
          hint="پس از پایان پردازش، اقدامات اینجا فهرست می‌شوند."
        />
      );
    }
    return (
      <EmptyState
        icon={AlertTriangle}
        title="خطا در بارگذاری موارد اقدام"
        tone="destructive"
      />
    );
  }

  if (!data) return null;

  if (data.action_items.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="مورد اقدامی استخراج نشد"
        hint="در این جلسه وظیفه‌ی مشخصی برای پیگیری شناسایی نشد."
      />
    );
  }

  return (
    <ol className="space-y-2" dir="rtl">
      {data.action_items.map((item, idx) => (
        <li key={idx}>
          <Card size="sm" className="transition-colors hover:border-foreground/20">
            <CardContent className="flex items-start gap-3">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium leading-7" dir={dirOf(item.text)}>
                  {item.text}
                </p>
                {(item.owner || item.due_date) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {item.owner && (
                      <Badge variant="secondary" dir={dirOf(item.owner)}>
                        {item.owner}
                      </Badge>
                    )}
                    {item.due_date && (
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <CalendarDays className="size-3.5" />
                        <span>{formatJalali(item.due_date)}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}
