"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileAudio, Mic, MonitorPlay, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  const [newSeriesOpen, setNewSeriesOpen] = useState(false);
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
      setNewSeriesOpen(false);
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
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base font-semibold">جلسه جدید</CardTitle>
        <CardDescription>
          فایل صوتی بارگذاری کنید، از میکروفون ضبط کنید، یا صدای تب دیگر را
          بگیرید.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-[1fr_140px]">
          <div className="space-y-1.5">
            <label
              htmlFor="meeting-title"
              className="text-xs font-medium text-muted-foreground"
            >
              عنوان <span className="opacity-60">(اختیاری)</span>
            </label>
            <Input
              id="meeting-title"
              dir="auto"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: استندآپ تیم بک‌اند"
              disabled={uploading}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="meeting-num-speakers"
              className="text-xs font-medium text-muted-foreground"
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
              className="h-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="meeting-brief"
            className="text-xs font-medium text-muted-foreground"
          >
            توضیح کوتاه و افراد حاضر <span className="opacity-60">(اختیاری)</span>
          </label>
          <Textarea
            id="meeting-brief"
            dir="auto"
            value={meetingBrief}
            onChange={(e) => setMeetingBrief(e.target.value)}
            placeholder="مثال: جلسه‌ی هفتگی تیم پروژه‌ی X. حضار: سپهر (بک‌اند)، علی (فرانت)، مریم (PM). موضوع: بررسی بلاکر دیپلوی."
            disabled={uploading}
            rows={3}
          />
          <p className="text-[11px] leading-5 text-muted-foreground">
            این متن به مدل خلاصه‌ساز پاس داده می‌شود و برای نگاشت اسامی افراد به
            صداها استفاده می‌شود. روی رونوشت اثری نمی‌گذارد.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              سری <span className="opacity-60">(اختیاری)</span>
            </label>
            <div className="flex gap-2">
              <Select
                value={seriesId ?? ""}
                onValueChange={(v) =>
                  setSeriesId((v as string) || null)
                }
                disabled={uploading}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue
                    placeholder="— هیچ‌کدام —"
                    children={
                      seriesId && seriesById[seriesId]
                        ? seriesById[seriesId].name
                        : undefined
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— هیچ‌کدام —</SelectItem>
                  {(seriesList ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover
                open={newSeriesOpen}
                onOpenChange={setNewSeriesOpen}
              >
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      className="shrink-0"
                    >
                      <Plus className="size-4" />
                      <span>سری جدید</span>
                    </Button>
                  }
                />
                <PopoverContent align="end" className="w-72 space-y-2">
                  <Input
                    dir="auto"
                    value={newSeriesName}
                    onChange={(e) => setNewSeriesName(e.target.value)}
                    placeholder="نام سری"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newSeriesName.trim()) {
                        void handleCreateSeries();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleCreateSeries}
                    disabled={!newSeriesName.trim()}
                    className="w-full"
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
                className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                dir={dirOf(suggestion.name)}
              >
                <Sparkles className="size-3" />
                <span>
                  پیشنهاد: «{suggestion.name}» ({Math.round(suggestion.score)}%)
                </span>
              </button>
            )}
            {seriesId && seriesById[seriesId] && (
              <p className="text-[11px] text-muted-foreground">
                لحن ایمیل:{" "}
                <span className="font-medium text-foreground">
                  {seriesById[seriesId]!.email_tone === "formal"
                    ? "رسمی"
                    : "خودمانی"}
                </span>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              برچسب‌ها
            </label>
            <div className="flex min-h-9 flex-wrap items-center gap-1.5">
              {(tagsList ?? []).length === 0 ? (
                <span className="text-[11px] text-muted-foreground">
                  برچسبی ثبت نشده. از صفحه‌ی برچسب‌ها اضافه کنید.
                </span>
              ) : (
                (tagsList ?? []).map((t) => {
                  const active = tagIds.includes(t.id);
                  return (
                    <Badge
                      key={t.id}
                      variant={active ? "default" : "outline"}
                      className="cursor-pointer transition-colors"
                      onClick={() => !uploading && toggleTag(t.id)}
                      dir={dirOf(t.name)}
                    >
                      {t.name}
                    </Badge>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <Tabs defaultValue="file" className="w-full">
          <TabsList className="w-fit">
            <TabsTrigger value="file">
              <FileAudio className="size-4" />
              <span>فایل</span>
            </TabsTrigger>
            <TabsTrigger value="mic">
              <Mic className="size-4" />
              <span>میکروفون</span>
            </TabsTrigger>
            <TabsTrigger value="tab">
              <MonitorPlay className="size-4" />
              <span>تب مرورگر</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="file" className="mt-3">
            <Dropzone onFilePicked={handleFile} disabled={uploading} />
          </TabsContent>
          <TabsContent value="mic" className="mt-3">
            <div className="rounded-lg border border-border bg-card/40 p-4">
              <Recorder
                inline
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
          </TabsContent>
          <TabsContent value="tab" className="mt-3">
            <div className="rounded-lg border border-border bg-card/40 p-4">
              <TabRecorder
                inline
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
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
