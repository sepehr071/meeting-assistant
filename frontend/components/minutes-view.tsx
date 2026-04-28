"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getMeeting,
  getSummary,
  listSeriesSpeakerNames,
  renameSpeaker,
  type MeetingDetail,
  type SummaryRead,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { dirOf } from "@/lib/rtl";

interface MinutesViewProps {
  meetingId: string;
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mm = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("404 ");
}

interface SpeakerChipProps {
  meetingId: string;
  speakerId: string;
  alias: string | null;
  seriesId: string | null;
}

function SpeakerChip({ meetingId, speakerId, alias, seriesId }: SpeakerChipProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(alias ?? "");

  const knownNamesQ = useQuery({
    queryKey: ["speaker-names", seriesId],
    queryFn: () => listSeriesSpeakerNames(seriesId ?? ""),
    enabled: open && !!seriesId,
  });

  const renameMut = useMutation({
    mutationFn: (name: string) => renameSpeaker(meetingId, speakerId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting", meetingId] });
      queryClient.invalidateQueries({ queryKey: ["summary", meetingId] });
      if (seriesId) {
        queryClient.invalidateQueries({ queryKey: ["speaker-names", seriesId] });
        queryClient.invalidateQueries({ queryKey: ["keyterms", seriesId] });
      }
      toast.success("نام گوینده ذخیره شد");
      setOpen(false);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "خطا";
      toast.error(`ذخیره ناموفق: ${message}`);
    },
  });

  const display = alias ?? speakerId;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(alias ?? "");
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            <span>{display}</span>
            <Pencil className="size-3 opacity-60" />
          </button>
        }
      />
      <PopoverContent align="start" className="w-64">
        <div className="space-y-2" dir="rtl">
          <label className="text-xs font-medium text-muted-foreground">
            نام گوینده
          </label>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={speakerId}
            disabled={renameMut.isPending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                renameMut.mutate(draft.trim());
              }
            }}
          />
          {seriesId && (knownNamesQ.data ?? []).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                از این سری
              </p>
              <div className="flex flex-wrap gap-1">
                {(knownNamesQ.data ?? []).map((name) => (
                  <Badge
                    key={name}
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => setDraft(name)}
                    dir={dirOf(name)}
                  >
                    {name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                if (draft.trim()) renameMut.mutate(draft.trim());
              }}
              disabled={renameMut.isPending || !draft.trim()}
            >
              ذخیره
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MinutesView({ meetingId }: MinutesViewProps) {
  const summaryQ = useQuery<SummaryRead>({
    queryKey: ["summary", meetingId],
    queryFn: () => getSummary(meetingId),
    retry: false,
  });

  const meetingQ = useQuery<MeetingDetail>({
    queryKey: ["meeting", meetingId],
    queryFn: () => getMeeting(meetingId),
  });

  if (summaryQ.isLoading || meetingQ.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (summaryQ.isError) {
    if (isNotFound(summaryQ.error)) {
      return (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            خلاصه هنوز آماده نیست
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-destructive">
          خطا در بارگذاری صورتجلسه
        </CardContent>
      </Card>
    );
  }

  if (!summaryQ.data) return null;

  const aliasMap: Record<string, string | null> = {};
  for (const sp of meetingQ.data?.speakers ?? []) {
    aliasMap[sp.speaker_id] = sp.display_name;
  }
  for (const [id, info] of Object.entries(summaryQ.data.speakers ?? {})) {
    if (!(id in aliasMap)) aliasMap[id] = info.display_name;
  }

  if (summaryQ.data.minutes.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          صورتجلسه‌ای استخراج نشد
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {summaryQ.data.minutes.map((segment, idx) => (
        <Card key={idx} size="sm">
          <CardContent className="flex items-start gap-3">
            <SpeakerChip
              meetingId={meetingId}
              speakerId={segment.speaker_id}
              alias={aliasMap[segment.speaker_id] ?? null}
              seriesId={meetingQ.data?.series_id ?? null}
            />
            <p
              dir="rtl"
              className="flex-1 text-sm leading-7 whitespace-pre-wrap"
            >
              {segment.text}
            </p>
            <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
              {formatTime(segment.start_s)}–{formatTime(segment.end_s)}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
