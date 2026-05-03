"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CircleStop } from "lucide-react";
import { toast } from "sonner";

import { ActionItemsView } from "@/components/action-items-view";
import { ChatView } from "@/components/chat-view";
import { DecisionsView } from "@/components/decisions-view";
import { EmailDraftView } from "@/components/email-draft-view";
import { MeetingSidebar } from "@/components/meeting-sidebar";
import { MinutesView } from "@/components/minutes-view";
import { OpenQuestionsView } from "@/components/open-questions-view";
import { QAView } from "@/components/qa-view";
import { SummaryView } from "@/components/summary-view";
import { TranscriptView } from "@/components/transcript-view";
import { Button } from "@/components/ui/button";
import {
  CANCELLED_SENTINEL,
  cancelMeeting,
  getMeeting,
  getSummary,
  regenerate,
  type MeetingDetail,
  type SummaryRead,
} from "@/lib/api";

const IN_FLIGHT = new Set(["uploaded", "transcribing", "summarizing"]);

const PROCESSING_LABELS: Record<string, string> = {
  uploaded: "در صف پردازش…",
  transcribing: "درحال رونویسی صدا…",
  summarizing: "درحال خلاصه‌سازی…",
};

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const total = Math.max(0, Math.round(seconds));
  const mm = Math.floor(total / 60).toString().padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>("summary");

  const meetingQ = useQuery<MeetingDetail>({
    queryKey: ["meeting", id],
    queryFn: () => getMeeting(id),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s && IN_FLIGHT.has(s) ? 2000 : false;
    },
  });

  const summaryQ = useQuery<SummaryRead>({
    queryKey: ["summary", id],
    queryFn: () => getSummary(id),
    enabled: meetingQ.data?.status === "done",
    retry: false,
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

  const counts = useMemo(() => {
    const s = summaryQ.data;
    return {
      summary: null,
      actions: s?.action_items.length ?? null,
      decisions: s?.decisions.length ?? null,
      qa: s?.qa.length ?? null,
      open: s?.open_questions.length ?? null,
      email: null,
      minutes: s?.minutes.length ?? null,
      transcript: null,
      chat: null,
    };
  }, [summaryQ.data]);

  function handleShare() {
    if (typeof navigator === "undefined") return;
    const url = window.location.href;
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.success("لینک جلسه کپی شد"))
      .catch(() => toast.error("کپی ناموفق"));
  }

  return (
    <div className="flex h-[calc(100vh-0px)] min-h-[100dvh]">
      <MeetingSidebar
        meetingId={id}
        title={title}
        duration={duration}
        speakerCount={meeting?.speakers?.length ?? null}
        createdAt={meeting?.created_at ?? null}
        active={tab}
        onSelect={setTab}
        counts={counts}
        initialStatus={meeting?.status}
        onShare={handleShare}
        onRegenerate={() => regenerateMut.mutate()}
        regenDisabled={
          regenerateMut.isPending || !meeting || status !== "done"
        }
        regenPending={regenerateMut.isPending}
      />
      <main
        className="flex-1 overflow-y-auto bg-bg scroll-thin"
        dir="rtl"
      >
        <div className="mx-auto max-w-[880px] px-10 py-9 pb-20">
          {inFlight && (
            <div
              className="mb-6 flex items-center gap-3 rounded-xl border border-brand-soft bg-brand-soft/50 px-4 py-3 text-sm text-brand-ink"
              aria-live="polite"
            >
              <span
                className="size-2 shrink-0 rounded-full bg-brand animate-pulse-dot"
                aria-hidden="true"
              />
              <span className="flex-1">
                {PROCESSING_LABELS[status!] ?? "درحال پردازش…"}
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
                className="gap-1.5"
              >
                <CircleStop
                  className={cancelMut.isPending ? "animate-pulse" : undefined}
                />
                توقف
              </Button>
            </div>
          )}

          {status === "failed" ? (
            isCancelled ? (
              <div className="rounded-2xl border border-line bg-surface p-6">
                <p className="text-base font-semibold text-ink">
                  پردازش متوقف شد
                </p>
                <p className="mt-1 text-sm text-ink-3">
                  این جلسه توسط کاربر متوقف شد. می‌توانید دوباره بارگذاری کنید.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
                <div>
                  <p className="text-sm font-semibold text-destructive">
                    خطا در پردازش جلسه
                  </p>
                  <p className="mt-1 text-sm text-ink-3">
                    {meeting?.error_message || "خطای ناشناخته"}
                  </p>
                </div>
              </div>
            )
          ) : (
            <Panel
              tab={tab}
              meetingId={id}
              chatReady={status === "done"}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function Panel({
  tab,
  meetingId,
  chatReady,
}: {
  tab: string;
  meetingId: string;
  chatReady: boolean;
}) {
  switch (tab) {
    case "summary":
      return <SummaryView meetingId={meetingId} />;
    case "actions":
      return <ActionItemsView meetingId={meetingId} />;
    case "decisions":
      return <DecisionsView meetingId={meetingId} />;
    case "qa":
      return <QAView meetingId={meetingId} />;
    case "open":
      return <OpenQuestionsView meetingId={meetingId} />;
    case "email":
      return <EmailDraftView meetingId={meetingId} />;
    case "minutes":
      return <MinutesView meetingId={meetingId} />;
    case "transcript":
      return <TranscriptView meetingId={meetingId} />;
    case "chat":
      return <ChatView meetingId={meetingId} ready={chatReady} />;
    default:
      return null;
  }
}
