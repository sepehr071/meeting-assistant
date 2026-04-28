"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ActionItemsView } from "@/components/action-items-view";
import { DecisionsView } from "@/components/decisions-view";
import { EmailDraftView } from "@/components/email-draft-view";
import { MeetingStatus } from "@/components/meeting-status";
import { MinutesView } from "@/components/minutes-view";
import { OpenQuestionsView } from "@/components/open-questions-view";
import { QAView } from "@/components/qa-view";
import { SummaryView } from "@/components/summary-view";
import { TranscriptView } from "@/components/transcript-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { getMeeting, regenerate, type MeetingDetail } from "@/lib/api";
import { dirOf, formatJalali } from "@/lib/rtl";

const IN_FLIGHT = new Set(["uploaded", "transcribing", "summarizing"]);

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const total = Math.max(0, Math.round(seconds));
  const mm = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();

  const meetingQ = useQuery<MeetingDetail>({
    queryKey: ["meeting", id],
    queryFn: () => getMeeting(id),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s && IN_FLIGHT.has(s) ? 2000 : false;
    },
  });

  const regenerateMut = useMutation({
    mutationFn: () => regenerate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary", id] });
      toast.success("بازتولید خلاصه آغاز شد");
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "خطا";
      toast.error(`بازتولید ناموفق: ${message}`);
    },
  });

  const meeting = meetingQ.data;
  const title = meeting?.title?.trim() || meeting?.original_filename || "";
  const duration = formatDuration(meeting?.duration_s ?? null);
  const status = meeting?.status;

  return (
    <main className="container mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4" />
          <span>بازگشت به فهرست</span>
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1 text-right">
          {meetingQ.isLoading ? (
            <Skeleton className="h-7 w-64" />
          ) : (
            <h1
              dir={title ? dirOf(title) : "rtl"}
              className="truncate text-2xl font-bold"
            >
              {title || "—"}
            </h1>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {meeting?.created_at && (
              <span>{formatJalali(meeting.created_at)}</span>
            )}
            {duration && <span className="font-mono tabular-nums">{duration}</span>}
          </div>
        </div>
        <div className="shrink-0">
          {meeting && (
            <MeetingStatus meetingId={id} initialStatus={meeting.status} />
          )}
        </div>
      </header>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => regenerateMut.mutate()}
          disabled={regenerateMut.isPending || !meeting || status !== "done"}
        >
          <RefreshCw
            className={regenerateMut.isPending ? "animate-spin" : undefined}
          />
          <span>بازتولید خلاصه</span>
        </Button>
      </div>

      {status === "failed" ? (
        <Card>
          <CardContent className="space-y-1 py-4 text-sm text-destructive" dir="rtl">
            <p className="font-semibold">خطا در پردازش جلسه</p>
            <p className="text-muted-foreground">
              {meeting?.error_message || "خطای ناشناخته"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="w-full flex-wrap">
            <TabsTrigger value="summary">خلاصه</TabsTrigger>
            <TabsTrigger value="actions">اقدامات</TabsTrigger>
            <TabsTrigger value="decisions">تصمیم‌ها</TabsTrigger>
            <TabsTrigger value="qa">پرسش‌وپاسخ</TabsTrigger>
            <TabsTrigger value="open">مسائل باز</TabsTrigger>
            <TabsTrigger value="email">پیش‌نویس ایمیل</TabsTrigger>
            <TabsTrigger value="minutes">صورتجلسه</TabsTrigger>
            <TabsTrigger value="transcript">رونوشت</TabsTrigger>
          </TabsList>
          <TabsContent value="summary" className="pt-2">
            <SummaryView meetingId={id} />
          </TabsContent>
          <TabsContent value="actions" className="pt-2">
            <ActionItemsView meetingId={id} />
          </TabsContent>
          <TabsContent value="decisions" className="pt-2">
            <DecisionsView meetingId={id} />
          </TabsContent>
          <TabsContent value="qa" className="pt-2">
            <QAView meetingId={id} />
          </TabsContent>
          <TabsContent value="open" className="pt-2">
            <OpenQuestionsView meetingId={id} />
          </TabsContent>
          <TabsContent value="email" className="pt-2">
            <EmailDraftView meetingId={id} />
          </TabsContent>
          <TabsContent value="minutes" className="pt-2">
            <MinutesView meetingId={id} />
          </TabsContent>
          <TabsContent value="transcript" className="pt-2">
            <TranscriptView meetingId={id} />
          </TabsContent>
        </Tabs>
      )}
    </main>
  );
}
