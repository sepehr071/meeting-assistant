"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  FileText,
  ListTree,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { PanelHeader } from "@/components/panel-header";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getMeeting,
  getSummary,
  listSeriesSpeakerNames,
  renameSpeaker,
  type MeetingDetail,
  type SummaryRead,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { dirOf } from "@/lib/rtl";

const SPEAKER_COLORS = [
  "oklch(0.55 0.16 270)",
  "oklch(0.66 0.13 200)",
  "oklch(0.62 0.14 155)",
  "oklch(0.78 0.13 80)",
  "oklch(0.6 0.22 25)",
  "oklch(0.55 0.14 320)",
];

interface MinutesViewProps {
  meetingId: string;
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mm = Math.floor(total / 60).toString().padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("404 ");
}

function colorFor(speakerId: string, allIds: string[]): string {
  const i = allIds.indexOf(speakerId);
  return SPEAKER_COLORS[(i < 0 ? 0 : i) % SPEAKER_COLORS.length];
}

interface SpeakerChipProps {
  meetingId: string;
  speakerId: string;
  alias: string | null;
  seriesId: string | null;
  color: string;
}

function SpeakerChip({
  meetingId,
  speakerId,
  alias,
  seriesId,
  color,
}: SpeakerChipProps) {
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
  const initial = display[0] ?? "?";

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
            className="group inline-flex shrink-0 items-center gap-1.5 rounded-full bg-bg-soft px-2 py-0.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-line-soft"
          >
            <span
              className="grid size-5 place-items-center rounded-full text-[10px] font-bold text-white"
              style={{ background: color }}
              aria-hidden="true"
            >
              {initial}
            </span>
            <span dir={dirOf(display)}>{display}</span>
            <Pencil className="size-2.5 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        }
      />
      <PopoverContent align="start" className="w-64">
        <div className="space-y-2" dir="rtl">
          <label className="text-xs font-medium text-ink-3">نام گوینده</label>
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
              <p className="text-xs text-ink-3">از این سری</p>
              <div className="flex flex-wrap gap-1">
                {(knownNamesQ.data ?? []).map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2 hover:border-brand hover:text-brand"
                    onClick={() => setDraft(name)}
                    dir={dirOf(name)}
                  >
                    {name}
                  </button>
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
      <>
        <PanelHeader kicker="صورتجلسه" title="…" />
        <div className="space-y-2">
          <div className="h-14 rounded animate-shimmer" />
          <div className="h-14 rounded animate-shimmer" />
        </div>
      </>
    );
  }

  if (summaryQ.isError) {
    if (isNotFound(summaryQ.error)) {
      return <EmptyState icon={FileText} title="خلاصه هنوز آماده نیست" />;
    }
    return (
      <EmptyState
        icon={AlertTriangle}
        title="خطا در بارگذاری صورتجلسه"
        tone="destructive"
      />
    );
  }

  if (!summaryQ.data) return null;

  if (summaryQ.data.minutes.length === 0) {
    return (
      <>
        <PanelHeader kicker="صورتجلسه" title="صورتجلسه‌ای استخراج نشد" />
        <EmptyState
          icon={ListTree}
          title="صورتجلسه‌ای استخراج نشد"
          hint="رونوشت کوتاه‌تر از آن بود که بخش‌بندی شود."
        />
      </>
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
    <>
      <PanelHeader
        kicker="صورتجلسه"
        title="صورتجلسه رسمی"
        subtitle={`${total.toLocaleString("fa-IR")} بخش`}
      />

      <div
        className="sticky top-0 z-10 mb-4 space-y-2 rounded-xl border border-line bg-surface/95 p-3 backdrop-blur"
        dir="rtl"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو در متن جلسه…"
            className="border-line bg-surface pe-9"
          />
        </div>
        {speakerIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {speakerIds.map((id) => {
              const name = aliasMap[id] ?? id;
              const active = activeSpeakers.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleSpeaker(id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] transition-colors",
                    active
                      ? "bg-ink text-white"
                      : "border border-line bg-surface text-ink-2 hover:border-ink-4",
                  )}
                  dir={dirOf(name)}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: colorFor(id, speakerIds) }}
                  />
                  {name}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-ink-4">
          <span>
            {filtersActive
              ? `${filtered.length} از ${total} بخش`
              : `${total} بخش`}
          </span>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-brand hover:underline"
            >
              <X className="size-3" />
              پاک کردن فیلترها
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="موردی با این فیلتر پیدا نشد"
          hint="جستجو یا انتخاب گویندگان را تغییر دهید."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((segment, idx) => (
            <article
              key={`${segment.speaker_id}-${segment.start_s}-${idx}`}
              className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3"
              style={{
                contentVisibility: "auto",
                containIntrinsicSize: "auto 88px",
              }}
            >
              <SpeakerChip
                meetingId={meetingId}
                speakerId={segment.speaker_id}
                alias={aliasMap[segment.speaker_id] ?? null}
                seriesId={meetingQ.data?.series_id ?? null}
                color={colorFor(segment.speaker_id, speakerIds)}
              />
              <p
                dir="rtl"
                className="flex-1 whitespace-pre-wrap text-[13.5px] leading-7 text-ink-2"
              >
                {segment.text}
              </p>
              <span className="shrink-0 font-mono text-[11px] text-ink-4 tabular-nums">
                {formatTime(segment.start_s)}
              </span>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
