"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CircleStop,
  Clock,
  RefreshCw,
  Share2,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { ActionItemsView } from "@/components/action-items-view";
import { ChatView } from "@/components/chat-view";
import { DecisionsView } from "@/components/decisions-view";
import { EmailDraftView } from "@/components/email-draft-view";
import {
  GROUPS,
  ICON_MAP,
  MeetingSidebar,
} from "@/components/meeting-sidebar";
import { MeetingStatus } from "@/components/meeting-status";
import { MinutesView } from "@/components/minutes-view";
import { OpenQuestionsView } from "@/components/open-questions-view";
import { QAView } from "@/components/qa-view";
import { SummaryView } from "@/components/summary-view";
import { TranscriptView } from "@/components/transcript-view";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { dirOf, formatJalali } from "@/lib/rtl";
import { cn } from "@/lib/utils";
import { friendlyMeetingError } from "@/lib/errors";
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
  const pad = { minimumIntegerDigits: 2, useGrouping: false };
  const mm = Math.floor(total / 60).toLocaleString("fa-IR", pad);
  const ss = (total % 60).toLocaleString("fa-IR", pad);
  return `${mm}:${ss}`;
}

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>("summary");
  const [metaOpen, setMetaOpen] = useState(false);

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

  const regenDisabled =
    regenerateMut.isPending || !meeting || status !== "done";
  const speakerCount = meeting?.speakers?.length ?? null;
  const createdAt = meeting?.created_at ?? null;

  return (
    <div className="flex min-h-[100dvh] flex-col md:h-[calc(100vh-0px)] md:flex-row">
      <MeetingSidebar
        meetingId={id}
        title={title}
        duration={duration}
        speakerCount={speakerCount}
        createdAt={createdAt}
        active={tab}
        onSelect={setTab}
        counts={counts}
        initialStatus={meeting?.status}
        onShare={handleShare}
        onRegenerate={() => regenerateMut.mutate()}
        regenDisabled={regenDisabled}
        regenPending={regenerateMut.isPending}
      />

      {/* Mobile chrome: sticky header + horizontally-scrollable tab bar. */}
      <div
        className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-sm md:hidden"
        dir="rtl"
      >
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <Link
            href="/"
            aria-label="همه جلسات"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-bg-soft hover:text-ink"
          >
            <ArrowRight className="size-4" />
          </Link>
          <h1
            dir={title ? dirOf(title) : "rtl"}
            className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-tight text-ink"
          >
            {title || "—"}
          </h1>
          <MeetingStatus
            meetingId={id}
            initialStatus={meeting?.status}
            className="shrink-0"
          />
          <Popover open={metaOpen} onOpenChange={setMetaOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label="جزئیات و عملیات جلسه"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-bg-soft text-ink-2 transition-colors hover:bg-line-soft"
                />
              }
            >
              <SlidersHorizontal className="size-4" />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-64 gap-0 p-0"
              dir="rtl"
            >
              <div className="flex flex-col gap-2 border-b border-line px-3.5 py-3 text-[12px] text-ink-3">
                {duration && (
                  <div className="flex items-center gap-2">
                    <Clock className="size-3.5 text-ink-4" />
                    <span className="font-mono tabular-nums">{duration}</span>
                  </div>
                )}
                {speakerCount != null && (
                  <div className="flex items-center gap-2">
                    <Users className="size-3.5 text-ink-4" />
                    <span>
                      {speakerCount.toLocaleString("fa-IR")} گوینده
                    </span>
                  </div>
                )}
                {createdAt && (
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-3.5 text-ink-4" />
                    <span>{formatJalali(createdAt)}</span>
                  </div>
                )}
                {!duration && speakerCount == null && !createdAt && (
                  <span className="text-ink-4">بدون اطلاعات بیشتر</span>
                )}
              </div>
              <div className="flex flex-col gap-1.5 p-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setMetaOpen(false);
                    handleShare();
                  }}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-line bg-bg-soft text-[13px] text-ink-2 transition-colors hover:bg-line-soft"
                >
                  <Share2 className="size-3.5" />
                  اشتراک‌گذاری
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMetaOpen(false);
                    regenerateMut.mutate();
                  }}
                  disabled={regenDisabled}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-line bg-bg-soft text-[13px] text-ink-2 transition-colors hover:bg-line-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw
                    className={cn(
                      "size-3.5",
                      regenerateMut.isPending && "animate-spin",
                    )}
                  />
                  بازتولید خلاصه
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <nav
          aria-label="بخش‌های جلسه"
          className="flex gap-1 overflow-x-auto px-3 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {GROUPS.flatMap((g) => g.items).map((t) => {
            const Icon = ICON_MAP[t.icon];
            const isActive = tab === t.id;
            const count = counts[t.id as keyof typeof counts];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] transition-colors",
                  isActive && t.accent
                    ? "bg-gradient-to-l from-indigo-500/15 to-violet-500/15 font-semibold text-brand-ink"
                    : isActive
                      ? "bg-brand-soft font-semibold text-brand-ink"
                      : t.accent
                        ? "text-brand hover:bg-bg-soft"
                        : "text-ink-2 hover:bg-bg-soft",
                )}
              >
                <Icon
                  className={cn(
                    "size-3.5 shrink-0",
                    t.accent && !isActive && "text-brand",
                  )}
                />
                <span>{t.label}</span>
                {count != null && count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px font-mono text-[10px] tabular-nums",
                      isActive ? "bg-surface text-ink-3" : "bg-line-soft text-ink-3",
                    )}
                  >
                    {count.toLocaleString("fa-IR")}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <main
        className="flex-1 overflow-y-auto bg-bg scroll-thin"
        dir="rtl"
      >
        <div className="mx-auto max-w-none px-4 py-5 pb-20 md:max-w-[880px] md:px-10 md:py-9">
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
                    {friendlyMeetingError(meeting?.error_message)}
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
