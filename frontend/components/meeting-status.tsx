"use client";

import { useQuery } from "@tanstack/react-query";

import {
  CANCELLED_SENTINEL,
  getMeeting,
  type MeetingStatus as MeetingStatusValue,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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

type BadgeVariant = "default" | "secondary" | "destructive";

function variantFor(status: MeetingStatusValue): BadgeVariant {
  if (status === "uploaded") return "secondary";
  if (status === "failed") return "destructive";
  return "default";
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
        <Badge variant="secondary" className={className}>
          ...
        </Badge>
      );
    }
    return null;
  }

  const inFlight = IN_FLIGHT.has(status);
  const isCancelled =
    status === "failed" && data?.error_message === CANCELLED_SENTINEL;
  const label = isCancelled ? "متوقف شده" : LABELS[status];

  const badge = (
    <Badge
      variant={isCancelled ? "secondary" : variantFor(status)}
      className={cn(
        status === "done" && "bg-emerald-500 text-white border-transparent",
        className,
      )}
    >
      {label}
    </Badge>
  );

  return (
    <div className="inline-flex items-center gap-2">
      {status === "failed" && data?.error_message && !isCancelled ? (
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0}>{badge}</span>} />
          <TooltipContent>{data.error_message}</TooltipContent>
        </Tooltip>
      ) : (
        badge
      )}
      {inFlight && (
        <Progress
          value={null}
          className="w-20"
          aria-label={label}
        />
      )}
    </div>
  );
}
