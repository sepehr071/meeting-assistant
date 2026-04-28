"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, Inbox, Layers, SearchX, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MeetingStatus } from "@/components/meeting-status";
import { UploadSection } from "@/components/upload-section";
import {
  listMeetings,
  listSeries,
  listTags,
  type Meeting,
  type SeriesWithCount,
} from "@/lib/api";
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
  const mm = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function MeetingCard({
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
      <Card className="transition-all group-hover:-translate-y-px group-hover:border-foreground/20 group-hover:shadow-sm">
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <h3
                dir={dirOf(label)}
                className="truncate text-base font-semibold leading-6 tracking-tight"
              >
                {label}
              </h3>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3.5" />
                  <span>{relativeFa(meeting.created_at)}</span>
                </span>
                {duration && (
                  <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                    <Clock className="size-3.5" />
                    <span>{duration}</span>
                  </span>
                )}
              </div>
            </div>
            <MeetingStatus
              meetingId={meeting.id}
              initialStatus={meeting.status}
            />
          </div>
          {series && (
            <div className="flex items-center gap-1.5 text-xs">
              <span
                className="size-1.5 rounded-full bg-primary"
                aria-hidden="true"
              />
              <span
                className="inline-flex items-center gap-1 truncate text-muted-foreground"
                dir={dirOf(series.name)}
              >
                <Layers className="size-3" />
                <span className="truncate">{series.name}</span>
              </span>
            </div>
          )}
        </CardContent>
      </Card>
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

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card/40 p-3"
        dir="rtl"
      >
        <div className="min-w-44 space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            سری
          </label>
          <Select
            value={seriesId ?? ""}
            onValueChange={(v) => setSeriesId((v as string) || null)}
          >
            <SelectTrigger className="h-9">
              <SelectValue
                placeholder="— همه —"
                children={
                  seriesId && seriesById[seriesId]
                    ? seriesById[seriesId].name
                    : undefined
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">— همه —</SelectItem>
              {(seriesList ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            جستجو
          </label>
          <Input
            dir="auto"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="عنوان جلسه…"
            className="h-9 w-48"
          />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            برچسب‌ها
          </label>
          <div className="flex min-h-9 flex-wrap items-center gap-1.5">
            {(tagsList ?? []).length === 0 ? (
              <span className="text-[11px] text-muted-foreground">—</span>
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
            onClick={() => {
              setSeriesId(null);
              setTagIds([]);
              setQ("");
            }}
          >
            <X className="size-3.5" />
            <span>پاک‌سازی</span>
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-destructive">
            خطا در بارگذاری فهرست جلسات
          </CardContent>
        </Card>
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
        <div className="grid gap-3">
          {data.map((m) => (
            <MeetingCard
              key={m.id}
              meeting={m}
              series={
                m.series_id ? seriesById[m.series_id] : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">جلسات شما</h1>
        <p className="text-sm text-muted-foreground">
          رونویسی و خلاصه‌سازی هوشمند جلسات فارسی.
        </p>
      </header>
      <UploadSection />
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-semibold tracking-tight">جلسات اخیر</h2>
        </div>
        <MeetingsList />
      </section>
    </main>
  );
}
