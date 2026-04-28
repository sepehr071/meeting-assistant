"use client";

import { useQuery } from "@tanstack/react-query";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
        <CardContent className="py-4">
          <Skeleton className="h-4 w-3/4" />
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

  const items = data?.open_questions ?? [];
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          مسئله‌ی باز ثبت نشد
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <Card key={i}>
          <CardContent className="flex items-start justify-between gap-3 py-4 text-sm">
            <p className="flex-1" dir={dirOf(item.question)}>
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
