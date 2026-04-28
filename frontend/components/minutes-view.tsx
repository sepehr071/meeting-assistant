"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Search, X } from "lucide-react";
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

  const [query, setQuery] = useState("");
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());

  const aliasMap = useMemo<Record<string, string | null>>(() => {
    const map: Record<string, string | null> = {};
    for (const sp of meetingQ.data?.speakers ?? []) {
      map[sp.speaker_id] = sp.display_name;
    }
    for (const [id, info] of Object.entries(summaryQ.data?.speakers ?? {})) {
      if (!(id in map)) map[id] = info.display_name;
    }
    return map;
  }, [meetingQ.data?.speakers, summaryQ.data?.speakers]);

  const speakerIds = useMemo(() => {
    const set = new Set<string>();
    for (const seg of summaryQ.data?.minutes ?? []) set.add(seg.speaker_id);
    for (const id of Object.keys(aliasMap)) set.add(id);
    return Array.from(set).sort();
  }, [summaryQ.data?.minutes, aliasMap]);

  const filtered = useMemo(() => {
    const segments = summaryQ.data?.minutes ?? [];
    const q = query.trim().toLowerCase();
    return segments.filter((seg) => {
      if (activeSpeakers.size > 0 && !activeSpeakers.has(seg.speaker_id)) {
        return false;
      }
      if (q && !seg.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [summaryQ.data?.minutes, query, activeSpeakers]);

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

  if (summaryQ.data.minutes.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          صورتجلسه‌ای استخراج نشد
        </CardContent>
      </Card>
    );
  }

  const total = summaryQ.data.minutes.length;
  const filtersActive = query.trim().length > 0 || activeSpeakers.size > 0;

  function toggleSpeaker(id: string) {
    setActiveSpeakers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setQuery("");
    setActiveSpeakers(new Set());
  }

  return (
    <div className="space-y-3">
      <div
        className="sticky top-0 z-10 space-y-2 rounded-md border bg-background/95 p-3 backdrop-blur"
        dir="rtl"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو در متن جلسه…"
            className="pr-9"
          />
        </div>
        {speakerIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {speakerIds.map((id) => {
              const name = aliasMap[id] ?? id;
              const active = activeSpeakers.has(id);
              return (
                <Badge
                  key={id}
                  variant={active ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleSpeaker(id)}
                  dir={dirOf(name)}
                >
                  {name}
                </Badge>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {filtersActive ? `${filtered.length} از ${total} بخش` : `${total} بخش`}
          </span>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <X className="size-3" />
              <span>پاک کردن فیلترها</span>
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            موردی با این فیلتر پیدا نشد
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((segment, idx) => (
            <Card
              key={`${segment.speaker_id}-${segment.start_s}-${idx}`}
              size="sm"
              style={{
                contentVisibility: "auto",
                containIntrinsicSize: "auto 88px",
              }}
            >
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
      )}
    </div>
  );
}
