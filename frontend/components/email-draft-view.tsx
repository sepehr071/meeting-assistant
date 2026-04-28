"use client";

import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
        <CardContent className="space-y-2 py-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32 w-full" />
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

  const email = data?.email;
  if (!email || (!email.subject && !email.body)) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          پیش‌نویس ایمیل تولید نشد
        </CardContent>
      </Card>
    );
  }

  const fullEmail = `${email.subject ?? ""}\n\n${email.body ?? ""}`.trim();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <Badge variant="secondary">
          لحن: {email.tone === "casual" ? "خودمانی" : "رسمی"}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={() => copy(fullEmail)}
          aria-label="کپی"
        >
          <Copy className="size-4" />
          <span>کپی کامل</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {email.subject && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">موضوع</p>
            <p className="font-medium" dir={dirOf(email.subject)}>
              {email.subject}
            </p>
          </div>
        )}
        {email.body && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">متن</p>
            <pre
              dir={dirOf(email.body)}
              className="whitespace-pre-wrap font-sans text-sm leading-7"
            >
              {email.body}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
