"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, HelpCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { getSummary, type SummaryRead } from "@/lib/api";
import { dirOf } from "@/lib/rtl";

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("404 ");
}

export function OpenQuestionsView({ meetingId }: { meetingId: string }) {
  const { data, isLoading, isError, error } = useQuery<SummaryRead>({
    queryKey: ["summary", meetingId],
    queryFn: () => getSummary(meetingId),
    retry: false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-5">
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    if (isNotFound(error)) {
      return <EmptyState icon={FileText} title="خلاصه هنوز آماده نیست" />;
    }
    return (
      <EmptyState
        icon={AlertTriangle}
        title="خطا در بارگذاری مسائل باز"
        tone="destructive"
      />
    );
  }

  const items = data?.open_questions ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        icon={HelpCircle}
        title="مسئله‌ی بازی ثبت نشد"
        hint="پرسش بدون پاسخی برای پیگیری شناسایی نشد."
      />
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <Card key={i} className="transition-colors hover:border-foreground/20">
          <CardContent className="flex items-start justify-between gap-3 py-4 text-sm">
            <p className="flex-1 leading-7" dir={dirOf(item.question)}>
              {item.question}
            </p>
            {item.owner && (
              <Badge variant="secondary" dir={dirOf(item.owner)}>
                {item.owner}
              </Badge>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
