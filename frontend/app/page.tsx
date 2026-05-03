"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  Filter,
  Inbox,
  Search,
  SearchX,
  Users,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EmptyState } from "@/components/empty-state";
import { MeetingStatus } from "@/components/meeting-status";
import { StatsStrip } from "@/components/stats-strip";
import { UploadSection } from "@/components/upload-section";
import {
  listMeetings,
  listSeries,
  listTags,
  type Meeting,
  type SeriesWithCount,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { dirOf } from "@/lib/rtl";

const RELATIVE_FA = new Intl.RelativeTimeFormat("fa-IR", { numeric: "auto" });

function relativeFa(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 60) return RELATIVE_FA.format(diffSeconds, "second");
  if (abs < 3600) return RELATIVE_FA.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86_400) return RELATIVE_FA.format(Math.round(diffSeconds / 3600), "hour");
  if (abs < 86_400 * 30)
    return RELATIVE_FA.format(Math.round(diffSeconds / 86_400), "day");
  if (abs < 86_400 * 365)
    return RELATIVE_FA.format(Math.round(diffSeconds / (86_400 * 30)), "month");
  return RELATIVE_FA.format(Math.round(diffSeconds / (86_400 * 365)), "year");
}

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const total = Math.max(0, Math.round(seconds));
  const mm = Math.floor(total / 60).toString().padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function MeetingRow({
  meeting,
  series,
}: {
  meeting: Meeting;
  series?: SeriesWithCount;
}) {
  const label = meeting.title?.trim() || meeting.original_filename;
  const duration = formatDuration(meeting.duration_s);
  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      <article className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 transition-all group-hover:-translate-y-px group-hover:border-ink-4 group-hover:shadow-card">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2">
            <h3
              dir={dirOf(label)}
              className="truncate text-[14.5px] font-semibold leading-tight text-ink"
            >
              {label}
            </h3>
            <MeetingStatus
              meetingId={meeting.id}
              initialStatus={meeting.status}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
            {series && (
              <span
                className="inline-flex items-center gap-1.5"
                dir={dirOf(series.name)}
              >
                <span
                  className="size-[5px] rounded-full bg-brand"
                  aria-hidden="true"
                />
                <span className="truncate">{series.name}</span>
              </span>
            )}
            {duration && (
              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                <Clock className="size-3" />
                <span>{duration}</span>
              </span>
            )}
            {meeting.num_speakers != null && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3" />
                <span>{meeting.num_speakers.toLocaleString("fa-IR")} نفر</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3" />
              <span>{relativeFa(meeting.created_at)}</span>
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function MeetingsList() {
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [q, setQ] = useState("");

  const { data: seriesList } = useQuery({
    queryKey: ["series"],
    queryFn: listSeries,
  });
  const { data: tagsList } = useQuery({
    queryKey: ["tags"],
    queryFn: listTags,
  });

  const seriesById = useMemo(() => {
    const map: Record<string, SeriesWithCount> = {};
    for (const s of seriesList ?? []) map[s.id] = s;
    return map;
  }, [seriesList]);

  const filterKey = [seriesId ?? "", tagIds.join(","), q.trim()];
  const { data, isLoading, isError } = useQuery<Meeting[]>({
    queryKey: ["meetings", ...filterKey],
    queryFn: () =>
      listMeetings({
        series_id: seriesId,
        tag_ids: tagIds,
        q: q.trim() || null,
      }),
  });

  const filtersActive = !!(seriesId || tagIds.length > 0 || q.trim());
  const count = data?.length ?? 0;

  function clearFilters() {
    setSeriesId(null);
    setTagIds([]);
    setQ("");
  }

  return (
    <section className="mt-7" dir="rtl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight text-ink">
          جلسات اخیر
        </h2>
        {!isLoading && (
          <span className="text-xs text-ink-4">
            {count.toLocaleString("fa-IR")} جلسه
          </span>
        )}
        <div className="ms-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
            <Input
              dir="auto"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجو در عناوین…"
              className="h-8 w-56 border-line bg-surface pe-8 text-xs"
            />
          </div>
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 border-line text-xs",
                    (tagIds.length > 0 || seriesId) &&
                      "border-brand text-brand",
                  )}
                >
                  <Filter className="size-3.5" />
                  فیلتر
                  {(tagIds.length > 0 || seriesId) && (
                    <span className="font-mono tabular-nums">
                      {(tagIds.length + (seriesId ? 1 : 0)).toLocaleString(
                        "fa-IR",
                      )}
                    </span>
                  )}
                </Button>
              }
            />
            <PopoverContent align="end" className="w-72 space-y-3">
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-ink-3">برچسب‌ها</p>
                <div className="flex flex-wrap gap-1.5">
                  {(tagsList ?? []).length === 0 ? (
                    <span className="text-[11px] text-ink-4">—</span>
                  ) : (
                    (tagsList ?? []).map((t) => {
                      const active = tagIds.includes(t.id);
                      return (
                        <Badge
                          key={t.id}
                          variant={active ? "default" : "outline"}
                          className="cursor-pointer transition-colors"
                          onClick={() =>
                            setTagIds((prev) =>
                              prev.includes(t.id)
                                ? prev.filter((x) => x !== t.id)
                                : [...prev, t.id],
                            )
                          }
                          dir={dirOf(t.name)}
                        >
                          {t.name}
                        </Badge>
                      );
                    })
                  )}
                </div>
              </div>
              {filtersActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="w-full"
                >
                  <X className="size-3.5" />
                  پاک‌سازی فیلترها
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {(seriesList ?? []).length > 0 && (
        <div
          className="mb-4 -mx-1 flex gap-1.5 overflow-x-auto scrollbar-none px-1"
          role="tablist"
        >
          <SeriesChip
            label="همه"
            active={seriesId === null}
            onClick={() => setSeriesId(null)}
          />
          {(seriesList ?? []).map((s) => (
            <SeriesChip
              key={s.id}
              label={s.name}
              count={s.meeting_count}
              active={seriesId === s.id}
              onClick={() => setSeriesId(seriesId === s.id ? null : s.id)}
            />
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[78px] rounded-xl border border-line-soft bg-bg-soft animate-shimmer"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center text-sm text-destructive">
          خطا در بارگذاری فهرست جلسات
        </div>
      ) : !data || data.length === 0 ? (
        filtersActive ? (
          <EmptyState
            icon={SearchX}
            title="نتیجه‌ای با این فیلترها یافت نشد"
            hint="فیلترها را تغییر دهید یا پاک کنید."
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title="هنوز جلسه‌ای ثبت نشده"
            hint="نخستین جلسه‌ی خود را از فرم بالا بارگذاری یا ضبط کنید."
          />
        )
      ) : (
        <div className="grid gap-2">
          {data.map((m) => (
            <MeetingRow
              key={m.id}
              meeting={m}
              series={m.series_id ? seriesById[m.series_id] : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SeriesChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition-all",
        active
          ? "border-ink bg-ink text-white"
          : "border-line bg-surface text-ink-2 hover:border-ink-4",
      )}
      dir={dirOf(label)}
    >
      <span>{label}</span>
      {count != null && (
        <span
          className={cn(
            "rounded-full px-1.5 text-[10px] font-mono tabular-nums",
            active ? "bg-white/20 text-white" : "bg-bg-soft text-ink-4",
          )}
        >
          {count.toLocaleString("fa-IR")}
        </span>
      )}
    </button>
  );
}

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8" dir="rtl">
      <header>
        <h1 className="text-[28px] font-bold tracking-tight text-ink">
          جلسات شما
        </h1>
        <p className="mt-1.5 text-[13.5px] text-ink-3">
          رونویسی و خلاصه‌سازی هوشمند جلسات فارسی.
        </p>
      </header>
      <StatsStrip />
      <div className="mt-7">
        <UploadSection />
      </div>
      <MeetingsList />
    </main>
  );
}
