"use client";

import { useQuery } from "@tanstack/react-query";

import {
  CANCELLED_SENTINEL,
  getMeeting,
  type MeetingStatus as MeetingStatusValue,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
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

const LABELS: Record<MeetingStatusValue, string> = {
  uploaded: "در صف",
  transcribing: "درحال رونویسی",
  summarizing: "درحال خلاصه‌سازی",
  done: "آماده",
  failed: "خطا",
};

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
        <Badge variant="secondary" className={className}>
          …
        </Badge>
      );
    }
    return null;
  }

  const inFlight = IN_FLIGHT.has(status);
  const isCancelled =
    status === "failed" && data?.error_message === CANCELLED_SENTINEL;
  const label = isCancelled ? "متوقف شده" : LABELS[status];

  const dotClass =
    status === "done"
      ? "bg-success"
      : status === "failed"
        ? isCancelled
          ? "bg-muted-foreground"
          : "bg-destructive"
        : status === "uploaded"
          ? "bg-muted-foreground"
          : "bg-primary";

  const variant: "default" | "secondary" | "destructive" =
    status === "done"
      ? "default"
      : status === "failed"
        ? isCancelled
          ? "secondary"
          : "destructive"
        : "secondary";

  const badge = (
    <Badge
      variant={variant}
      className={cn(
        "gap-1.5 transition-colors duration-300",
        status === "done" &&
          "bg-success text-success-foreground border-transparent",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          dotClass,
          inFlight && "animate-pulse-dot",
        )}
        aria-hidden="true"
      />
      <span>{label}</span>
    </Badge>
  );

  if (status === "failed" && data?.error_message && !isCancelled) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span tabIndex={0}>{badge}</span>} />
        <TooltipContent>{data.error_message}</TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}
