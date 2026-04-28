"use client";

import { useQuery } from "@tanstack/react-query";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
        <CardContent className="space-y-2 py-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          {isNotFound(error) ? "هنوز آماده نیست" : "خطا"}
        </CardContent>
      </Card>
    );
  }

  const items = data?.qa ?? [];
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          سؤالی در این جلسه ثبت نشد
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <Card key={i}>
          <CardContent className="space-y-2 py-4 text-sm">
            <p className="font-medium" dir={dirOf(item.question)}>
              س: {item.question}
            </p>
            <p
              className={
                item.answer
                  ? "text-foreground"
                  : "italic text-muted-foreground"
              }
              dir={dirOf(item.answer ?? "")}
            >
              {item.answer ? `ج: ${item.answer}` : "بی‌پاسخ"}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
