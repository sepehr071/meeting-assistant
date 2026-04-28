"use client";

import { useQuery } from "@tanstack/react-query";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSummary, type SummaryRead } from "@/lib/api";

interface DecisionsViewProps {
  meetingId: string;
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("404 ");
}

export function DecisionsView({ meetingId }: DecisionsViewProps) {
  const { data, isLoading, isError, error } = useQuery<SummaryRead>({
    queryKey: ["summary", meetingId],
    queryFn: () => getSummary(meetingId),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
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
          خطا در بارگذاری تصمیم‌ها
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  if (data.decisions.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          تصمیمی استخراج نشد
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <ol dir="rtl" className="space-y-2 text-sm leading-7">
          {data.decisions.map((decision, idx) => (
            <li key={idx} className="flex gap-2">
              <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
                {idx + 1}.
              </span>
              <span>{decision}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
