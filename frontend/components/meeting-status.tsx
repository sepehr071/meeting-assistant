"use client";

import { useQuery } from "@tanstack/react-query";

import {
  CANCELLED_SENTINEL,
  getMeeting,
  type MeetingStatus as MeetingStatusValue,
} from "@/lib/api";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const IN_FLIGHT: ReadonlySet<MeetingStatusValue> = new Set([
  "uploaded",
  "transcribing",
  "summarizing",
]);

interface PillStyle {
  label: string;
  bg: string;
  fg: string;
  dot: string;
  animate: boolean;
}

function styleFor(
  status: MeetingStatusValue,
  isCancelled: boolean,
): PillStyle {
  if (status === "done") {
    return {
      label: "آماده",
      bg: "oklch(0.95 0.05 155)",
      fg: "oklch(0.32 0.10 155)",
      dot: "var(--success)",
      animate: false,
    };
  }
  if (status === "failed") {
    if (isCancelled) {
      return {
        label: "متوقف شده",
        bg: "var(--bg-soft)",
        fg: "var(--ink-3)",
        dot: "var(--ink-4)",
        animate: false,
      };
    }
    return {
      label: "خطا",
      bg: "oklch(0.96 0.05 25)",
      fg: "oklch(0.45 0.18 25)",
      dot: "var(--destructive)",
      animate: false,
    };
  }
  if (status === "uploaded") {
    return {
      label: "در صف",
      bg: "var(--bg-soft)",
      fg: "var(--ink-3)",
      dot: "var(--ink-4)",
      animate: true,
    };
  }
  return {
    label: status === "transcribing" ? "درحال رونویسی" : "درحال خلاصه‌سازی",
    bg: "oklch(0.96 0.04 270)",
    fg: "var(--brand-ink)",
    dot: "var(--brand)",
    animate: true,
  };
}

export interface MeetingStatusProps {
  meetingId: string;
  initialStatus?: MeetingStatusValue;
  className?: string;
}

export function MeetingStatus({
  meetingId,
  initialStatus,
  className,
}: MeetingStatusProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["meeting", meetingId],
    queryFn: () => getMeeting(meetingId),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s && IN_FLIGHT.has(s) ? 2000 : false;
    },
  });

  const status: MeetingStatusValue | undefined = data?.status ?? initialStatus;

  if (!status) {
    if (isLoading) {
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full bg-bg-soft px-2.5 py-0.5 text-[11px] font-medium text-ink-4",
            className,
          )}
        >
          …
        </span>
      );
    }
    return null;
  }

  const isCancelled =
    status === "failed" && data?.error_message === CANCELLED_SENTINEL;
  const s = styleFor(status, isCancelled);

  const pill = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-medium",
        className,
      )}
      style={{ background: s.bg, color: s.fg }}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          s.animate && "animate-pulse-dot",
        )}
        style={{ background: s.dot }}
        aria-hidden="true"
      />
      <span>{s.label}</span>
    </span>
  );

  if (status === "failed" && data?.error_message && !isCancelled) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span tabIndex={0}>{pill}</span>} />
        <TooltipContent>{data.error_message}</TooltipContent>
      </Tooltip>
    );
  }

  return pill;
}
