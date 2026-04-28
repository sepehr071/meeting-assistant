"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MeetingStatus } from "@/components/meeting-status";
import { UploadSection } from "@/components/upload-section";
import {
  listMeetings,
  listSeries,
  listTags,
  type Meeting,
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

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const label = meeting.title?.trim() || meeting.original_filename;
  const duration = formatDuration(meeting.duration_s);
  return (
    <Link href={`/meetings/${meeting.id}`} className="block">
      <Card className="transition-colors hover:bg-muted/40">
        <CardHeader>
          <CardTitle dir={dirOf(label)} className="truncate">
            {label}
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-3">
            <span>{relativeFa(meeting.created_at)}</span>
            {duration && <span className="tabular-nums">{duration}</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MeetingStatus
            meetingId={meeting.id}
            initialStatus={meeting.status}
          />
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

  const filtersActive = seriesId || tagIds.length > 0 || q.trim();

  if (isLoading) {
    return (
      <div className="grid gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">خطا در بارگذاری فهرست جلسات</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">سری</label>
          <select
            value={seriesId ?? ""}
            onChange={(e) => setSeriesId(e.target.value || null)}
            className="rounded-md border border-input bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="">— همه —</option>
            {(seriesList ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">جستجو در عنوان</label>
          <Input
            dir="auto"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="..."
            className="h-9 w-44"
          />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">برچسب‌ها</label>
          <div className="flex flex-wrap gap-1">
            {(tagsList ?? []).length === 0 && (
              <span className="text-xs text-muted-foreground">—</span>
            )}
            {(tagsList ?? []).map((t) => {
              const active = tagIds.includes(t.id);
              return (
                <Badge
                  key={t.id}
                  variant={active ? "default" : "outline"}
                  className="cursor-pointer"
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
            })}
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
            پاک‌سازی
          </Button>
        )}
      </div>

      {!data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {filtersActive ? "نتیجه‌ای با این فیلترها یافت نشد" : "هنوز جلسه‌ای ثبت نشده"}
        </div>
      ) : (
        <div className="grid gap-3">
          {data.map((m) => (
            <MeetingCard key={m.id} meeting={m} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="container mx-auto max-w-5xl space-y-8 p-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">دستیار جلسه</h1>
          <p className="text-muted-foreground">
            رونویسی و خلاصه‌سازی هوشمند جلسات فارسی
          </p>
        </div>
        <nav className="flex gap-2">
          <Link href="/series">
            <Button variant="ghost" size="sm">
              سری‌ها
            </Button>
          </Link>
          <Link href="/tags">
            <Button variant="ghost" size="sm">
              برچسب‌ها
            </Button>
          </Link>
        </nav>
      </header>
      <UploadSection />
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">جلسات اخیر</h2>
        <MeetingsList />
      </section>
    </main>
  );
}
