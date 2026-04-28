"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Copy, FileText, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { getSummary, type SummaryRead } from "@/lib/api";
import { dirOf } from "@/lib/rtl";

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("404 ");
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("کپی شد");
  } catch {
    toast.error("کپی ناموفق");
  }
}

export function EmailDraftView({ meetingId }: { meetingId: string }) {
  const { data, isLoading, isError, error } = useQuery<SummaryRead>({
    queryKey: ["summary", meetingId],
    queryFn: () => getSummary(meetingId),
    retry: false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-2 py-5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32 w-full" />
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
        title="خطا در بارگذاری ایمیل"
        tone="destructive"
      />
    );
  }

  const email = data?.email;
  if (!email || (!email.subject && !email.body)) {
    return (
      <EmptyState
        icon={Mail}
        title="پیش‌نویس ایمیل تولید نشد"
        hint="جلسه‌ی کوتاه یا بدون اقدام مشخص — مدل پیش‌نویسی پیشنهاد نکرد."
      />
    );
  }

  const fullEmail = `${email.subject ?? ""}\n\n${email.body ?? ""}`.trim();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <Badge variant="secondary" className="gap-1.5">
          <span
            className="size-1.5 rounded-full bg-primary"
            aria-hidden="true"
          />
          {email.tone === "casual" ? "لحن خودمانی" : "لحن رسمی"}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={() => copy(fullEmail)}
          aria-label="کپی متن ایمیل"
        >
          <Copy className="size-4" />
          <span>کپی کامل</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {email.subject && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">موضوع</p>
            <p
              className="rounded-md border border-border bg-muted/30 px-3 py-2 font-medium leading-7"
              dir={dirOf(email.subject)}
            >
              {email.subject}
            </p>
          </div>
        )}
        {email.body && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">متن</p>
            <pre
              dir={dirOf(email.body)}
              className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-3 font-sans text-sm leading-8 text-foreground/90"
            >
              {email.body}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
