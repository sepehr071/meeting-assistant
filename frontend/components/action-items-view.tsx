"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSummary, type SummaryRead } from "@/lib/api";
import { formatJalali } from "@/lib/rtl";

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
          خطا در بارگذاری موارد اقدام
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  if (data.action_items.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          هیچ مورد اقدامی استخراج نشد
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2" dir="rtl">
      {data.action_items.map((item, idx) => (
        <Card key={idx} size="sm">
          <CardContent className="space-y-2">
            <p className="text-sm font-semibold leading-6">{item.text}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <User className="size-3.5" />
                {item.owner ? (
                  <Badge variant="secondary">{item.owner}</Badge>
                ) : (
                  <span>—</span>
                )}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                <span>{item.due_date ? formatJalali(item.due_date) : "—"}</span>
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
