"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, Gavel } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
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
        <EmptyState icon={FileText} title="خلاصه هنوز آماده نیست" />
      );
    }
    return (
      <EmptyState
        icon={AlertTriangle}
        title="خطا در بارگذاری تصمیم‌ها"
        tone="destructive"
      />
    );
  }

  if (!data) return null;

  if (data.decisions.length === 0) {
    return (
      <EmptyState
        icon={Gavel}
        title="تصمیمی استخراج نشد"
        hint="هیچ تصمیم قطعی در این جلسه شناسایی نشد."
      />
    );
  }

  return (
    <Card>
      <CardContent>
        <ol dir="rtl" className="space-y-3 text-sm leading-7">
          {data.decisions.map((decision, idx) => (
            <li key={idx} className="flex gap-3">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums">
                {idx + 1}
              </span>
              <span className="flex-1">{decision}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
