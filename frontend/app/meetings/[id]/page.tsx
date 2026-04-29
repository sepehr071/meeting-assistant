"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  CircleStop,
  Clock,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { ActionItemsView } from "@/components/action-items-view";
import { ChatView } from "@/components/chat-view";
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
import {
  CANCELLED_SENTINEL,
  cancelMeeting,
  getMeeting,
  regenerate,
  type MeetingDetail,
} from "@/lib/api";
import { dirOf, formatJalali } from "@/lib/rtl";

const IN_FLIGHT = new Set(["uploaded", "transcribing", "summarizing"]);

const PROCESSING_LABELS: Record<string, string> = {
  uploaded: "در صف پردازش…",
  transcribing: "درحال رونویسی صدا…",
  summarizing: "درحال خلاصه‌سازی…",
};

interface TabDef {
  value: string;
  label: string;
  accent?: boolean;
}

const TABS: TabDef[] = [
  { value: "summary", label: "خلاصه" },
  { value: "actions", label: "اقدامات" },
  { value: "decisions", label: "تصمیم‌ها" },
  { value: "qa", label: "پرسش‌وپاسخ" },
  { value: "open", label: "مسائل باز" },
  { value: "email", label: "پیش‌نویس ایمیل" },
  { value: "minutes", label: "صورتجلسه" },
  { value: "transcript", label: "رونوشت" },
  { value: "chat", label: "چت با جلسه", accent: true },
];

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
    onMutate: () => {
      queryClient.setQueryData<MeetingDetail>(["meeting", id], (old) =>
        old ? { ...old, status: "summarizing" } : old,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting", id] });
      queryClient.invalidateQueries({ queryKey: ["summary", id] });
      toast.success("بازتولید خلاصه آغاز شد");
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "خطا";
      toast.error(`بازتولید ناموفق: ${message}`);
    },
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelMeeting(id),
    onMutate: () => {
      queryClient.setQueryData<MeetingDetail>(["meeting", id], (old) =>
        old
          ? { ...old, status: "failed", error_message: CANCELLED_SENTINEL }
          : old,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting", id] });
      toast.success("پردازش متوقف شد");
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "خطا";
      toast.error(`توقف ناموفق: ${message}`);
      queryClient.invalidateQueries({ queryKey: ["meeting", id] });
    },
  });

  const meeting = meetingQ.data;
  const title = meeting?.title?.trim() || meeting?.original_filename || "";
  const duration = formatDuration(meeting?.duration_s ?? null);
  const status = meeting?.status;

  useEffect(() => {
    if (status === "done" || status === "failed") {
      queryClient.invalidateQueries({ queryKey: ["meeting", id] });
      queryClient.invalidateQueries({ queryKey: ["transcript", id] });
      queryClient.invalidateQueries({ queryKey: ["summary", id] });
    }
  }, [status, id, queryClient]);

  const inFlight = !!(status && IN_FLIGHT.has(status));
  const isCancelled =
    status === "failed" && meeting?.error_message === CANCELLED_SENTINEL;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            {meetingQ.isLoading ? (
              <Skeleton className="h-8 w-72" />
            ) : (
              <h1
                dir={title ? dirOf(title) : "rtl"}
                className="truncate text-2xl font-bold tracking-tight"
              >
                {title || "—"}
              </h1>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {meeting?.created_at && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3.5" />
                  <span>{formatJalali(meeting.created_at)}</span>
                </span>
              )}
              {duration && (
                <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                  <Clock className="size-3.5" />
                  <span>{duration}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {meeting && (
              <MeetingStatus meetingId={id} initialStatus={meeting.status} />
            )}
            {inFlight && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
              >
                <CircleStop
                  className={
                    cancelMut.isPending ? "animate-pulse" : undefined
                  }
                />
                <span>توقف</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => regenerateMut.mutate()}
              disabled={regenerateMut.isPending || !meeting || status !== "done"}
            >
              <RefreshCw
                className={
                  regenerateMut.isPending ? "animate-spin" : undefined
                }
              />
              <span>بازتولید</span>
            </Button>
          </div>
        </div>

        {inFlight && (
          <div
            className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground/85"
            dir="rtl"
            aria-live="polite"
          >
            <span
              className="inline-flex size-2 shrink-0 rounded-full bg-primary animate-pulse-dot"
              aria-hidden="true"
            />
            <span className="flex-1">
              {PROCESSING_LABELS[status!] ?? "درحال پردازش…"}
            </span>
          </div>
        )}
      </header>

      {status === "failed" ? (
        isCancelled ? (
          <Card>
            <CardContent
              className="space-y-1 py-4 text-sm text-muted-foreground"
              dir="rtl"
            >
              <p className="font-semibold text-foreground">پردازش متوقف شد</p>
              <p>
                این جلسه توسط کاربر متوقف شد. می‌توانید دوباره بارگذاری کنید.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-start gap-3 py-4 text-sm" dir="rtl">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p className="font-semibold text-destructive">خطا در پردازش جلسه</p>
                <p className="text-muted-foreground">
                  {meeting?.error_message || "خطای ناشناخته"}
                </p>
              </div>
            </CardContent>
          </Card>
        )
      ) : (
        <Tabs defaultValue="summary" className="w-full">
          <div
            className="-mx-1 overflow-x-auto scrollbar-none mask-fade-x"
            dir="rtl"
          >
            <TabsList className="px-1">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className={
                    t.accent
                      ? "gap-1.5 text-indigo-600 dark:text-indigo-400 data-active:bg-gradient-to-l data-active:from-indigo-500 data-active:to-violet-500 data-active:text-white data-active:font-bold data-active:border-transparent"
                      : undefined
                  }
                >
                  {t.accent && <Sparkles className="size-3.5" />}
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
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
          <TabsContent value="chat" className="pt-2">
            <ChatView meetingId={id} ready={meeting?.status === "done"} />
          </TabsContent>
        </Tabs>
      )}
    </main>
  );
}
