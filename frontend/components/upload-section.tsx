"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Dropzone } from "@/components/dropzone";
import { Recorder } from "@/components/recorder";
import { TabRecorder } from "@/components/tab-recorder";
import {
  createSeries,
  listSeries,
  listTags,
  suggestSeries,
  uploadMeeting,
  type SeriesSuggestion,
  type SeriesWithCount,
} from "@/lib/api";
import { dirOf } from "@/lib/rtl";

export function UploadSection() {
  const [title, setTitle] = useState("");
  const [numSpeakersStr, setNumSpeakersStr] = useState("");
  const [meetingBrief, setMeetingBrief] = useState("");
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState<SeriesSuggestion | null>(null);
  const [uploading, setUploading] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState("");
  const router = useRouter();
  const queryClient = useQueryClient();

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

  useEffect(() => {
    const trimmed = title.trim();
    if (!trimmed || seriesId) {
      setSuggestion(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const s = await suggestSeries(trimmed);
        setSuggestion(s);
      } catch {
        setSuggestion(null);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [title, seriesId]);

  const numSpeakers = numSpeakersStr.trim()
    ? Math.max(1, Math.min(32, Number.parseInt(numSpeakersStr, 10) || 0)) ||
      null
    : null;

  function clearFields() {
    setTitle("");
    setNumSpeakersStr("");
    setMeetingBrief("");
    setSeriesId(null);
    setTagIds([]);
    setSuggestion(null);
  }

  async function handleCreateSeries() {
    const name = newSeriesName.trim();
    if (!name) return;
    try {
      const s = await createSeries({ name });
      setNewSeriesName("");
      setSeriesId(s.id);
      queryClient.invalidateQueries({ queryKey: ["series"] });
      toast.success("سری ساخته شد");
    } catch (e) {
      toast.error(String(e));
    }
  }

  function toggleTag(id: string) {
    setTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleFile(file: File) {
    if (uploading) return;
    setUploading(true);
    try {
      const meeting = await uploadMeeting(file, {
        title: title.trim() || undefined,
        num_speakers: numSpeakers,
        meeting_brief: meetingBrief.trim() || undefined,
        series_id: seriesId ?? undefined,
        tag_ids: tagIds,
      });
      toast.success("فایل با موفقیت بارگذاری شد");
      clearFields();
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      router.push(`/meetings/${meeting.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "خطا در بارگذاری";
      toast.error(`بارگذاری ناموفق: ${message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>جلسه جدید</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[1fr_140px]">
          <div className="space-y-2">
            <label
              htmlFor="meeting-title"
              className="text-sm font-medium text-muted-foreground"
            >
              عنوان (اختیاری)
            </label>
            <Input
              id="meeting-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: استندآپ تیم بک‌اند"
              disabled={uploading}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="meeting-num-speakers"
              className="text-sm font-medium text-muted-foreground"
            >
              تعداد افراد
            </label>
            <Input
              id="meeting-num-speakers"
              type="number"
              min={1}
              max={32}
              inputMode="numeric"
              value={numSpeakersStr}
              onChange={(e) => setNumSpeakersStr(e.target.value)}
              placeholder="خودکار"
              disabled={uploading}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label
            htmlFor="meeting-brief"
            className="text-sm font-medium text-muted-foreground"
          >
            توضیح کوتاه و افراد حاضر (اختیاری)
          </label>
          <textarea
            id="meeting-brief"
            value={meetingBrief}
            onChange={(e) => setMeetingBrief(e.target.value)}
            placeholder="مثال: جلسه‌ی هفتگی تیم پروژه‌ی X. حضار: سپهر (بک‌اند)، علی (فرانت)، مریم (PM). موضوع: بررسی بلاکر دیپلوی."
            disabled={uploading}
            rows={3}
            className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          />
          <p className="text-xs text-muted-foreground">
            این متن به مدل خلاصه‌ساز پاس داده می‌شود و برای نگاشت اسامی افراد به
            صداها استفاده می‌شود. روی رونوشت اثری نمی‌گذارد.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              سری (اختیاری)
            </label>
            <div className="flex flex-wrap gap-2">
              <select
                value={seriesId ?? ""}
                onChange={(e) => setSeriesId(e.target.value || null)}
                disabled={uploading}
                className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
              >
                <option value="">— هیچ‌کدام —</option>
                {(seriesList ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button variant="outline" size="sm" disabled={uploading}>
                      + سری جدید
                    </Button>
                  }
                />
                <PopoverContent className="w-72 space-y-2">
                  <Input
                    dir="auto"
                    value={newSeriesName}
                    onChange={(e) => setNewSeriesName(e.target.value)}
                    placeholder="نام سری"
                  />
                  <Button
                    size="sm"
                    onClick={handleCreateSeries}
                    disabled={!newSeriesName.trim()}
                  >
                    ساخت
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
            {suggestion && !seriesId && (
              <button
                type="button"
                onClick={() => setSeriesId(suggestion.series_id)}
                className="text-xs text-primary underline-offset-2 hover:underline"
                dir={dirOf(suggestion.name)}
              >
                پیشنهاد: «{suggestion.name}» (تطابق {Math.round(suggestion.score)}%)
              </button>
            )}
            {seriesId && seriesById[seriesId] && (
              <p className="text-xs text-muted-foreground">
                لحن ایمیل:{" "}
                {seriesById[seriesId]!.email_tone === "formal"
                  ? "رسمی"
                  : "خودمانی"}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              برچسب‌ها
            </label>
            <div className="flex flex-wrap gap-1">
              {(tagsList ?? []).map((t) => {
                const active = tagIds.includes(t.id);
                return (
                  <Badge
                    key={t.id}
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => !uploading && toggleTag(t.id)}
                    dir={dirOf(t.name)}
                  >
                    {t.name}
                  </Badge>
                );
              })}
              {(tagsList ?? []).length === 0 && (
                <span className="text-xs text-muted-foreground">
                  برچسبی ثبت نشده. در صفحه‌ی برچسب‌ها اضافه کنید.
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Dropzone onFilePicked={handleFile} disabled={uploading} />
          <Recorder
            title={title.trim() || undefined}
            numSpeakers={numSpeakers}
            meetingBrief={meetingBrief.trim() || undefined}
            seriesId={seriesId}
            tagIds={tagIds}
            onUploaded={(id) => {
              clearFields();
              queryClient.invalidateQueries({ queryKey: ["meetings"] });
              router.push(`/meetings/${id}`);
            }}
          />
          <TabRecorder
            title={title.trim() || undefined}
            numSpeakers={numSpeakers}
            meetingBrief={meetingBrief.trim() || undefined}
            seriesId={seriesId}
            tagIds={tagIds}
            onUploaded={(id) => {
              clearFields();
              queryClient.invalidateQueries({ queryKey: ["meetings"] });
              router.push(`/meetings/${id}`);
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
