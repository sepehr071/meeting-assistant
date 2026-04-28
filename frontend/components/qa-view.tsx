"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, MessagesSquare } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { getSummary, type SummaryRead } from "@/lib/api";
import { dirOf } from "@/lib/rtl";

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("404 ");
}

export function QAView({ meetingId }: { meetingId: string }) {
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
          <Skeleton className="h-4 w-2/3" />
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
        title="خطا در بارگذاری پرسش‌وپاسخ"
        tone="destructive"
      />
    );
  }

  const items = data?.qa ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="سؤالی در این جلسه ثبت نشد"
        hint="هیچ سؤال صریحی در طول گفتگو شناسایی نشد."
      />
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <Card key={i} className="transition-colors hover:border-foreground/20">
          <CardContent className="space-y-2 py-4 text-sm">
            <p
              className="font-medium leading-7 text-foreground"
              dir={dirOf(item.question)}
            >
              <span className="me-1.5 inline-flex size-5 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                س
              </span>
              {item.question}
            </p>
            <p
              className={
                item.answer
                  ? "leading-7 text-foreground/85"
                  : "italic text-muted-foreground leading-7"
              }
              dir={dirOf(item.answer ?? "")}
            >
              {item.answer ? (
                <>
                  <span className="me-1.5 inline-flex size-5 items-center justify-center rounded-md bg-success/15 text-[10px] font-bold text-success">
                    ج
                  </span>
                  {item.answer}
                </>
              ) : (
                "بی‌پاسخ ماند"
              )}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
