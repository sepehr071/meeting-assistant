"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  FileAudio,
  Mic,
  MonitorPlay,
  Plus,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { dirOf } from "@/lib/rtl";

type CaptureMode = "file" | "mic" | "tab";

const MODES: Array<{ id: CaptureMode; label: string; Icon: typeof Mic }> = [
  { id: "file", label: "فایل", Icon: FileAudio },
  { id: "mic", label: "میکروفون", Icon: Mic },
  { id: "tab", label: "تب", Icon: MonitorPlay },
];

export function UploadSection() {
  const [mode, setMode] = useState<CaptureMode>("file");
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
    <section
      className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
      dir="rtl"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">جلسه جدید</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            بارگذاری فایل، ضبط زنده یا گرفتن صدای تب
          </p>
        </div>
        <div
          className="flex gap-1 rounded-[9px] border border-line-soft bg-bg-soft p-[3px]"
          role="tablist"
        >
          {MODES.map((m) => {
            const active = mode === m.id;
            const Icon = m.Icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                role="tab"
                aria-selected={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-all",
                  active
                    ? "bg-surface font-semibold text-ink shadow-card"
                    : "text-ink-3 hover:text-ink-2",
                )}
              >
                <Icon className="size-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4">
        {mode === "file" && (
          <Dropzone onFilePicked={handleFile} disabled={uploading} />
        )}
        {mode === "mic" && (
          <div className="rounded-xl border border-line bg-bg-soft p-4">
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
        )}
        {mode === "tab" && (
          <div className="rounded-xl border border-line bg-bg-soft p-4">
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
        )}
      </div>

      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1.4fr_1fr_140px_auto]">
        <Field label="عنوان (اختیاری)">
          <Input
            id="meeting-title"
            dir="auto"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثلاً: استندآپ تیم بک‌اند"
            disabled={uploading}
            className="h-9 border-line bg-surface"
          />
        </Field>
        <Field label="سری">
          <div className="flex gap-1.5">
            <Select
              value={seriesId ?? ""}
              onValueChange={(v) => setSeriesId((v as string) || null)}
              disabled={uploading}
            >
              <SelectTrigger className="h-9 flex-1 border-line bg-surface">
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
            <Popover open={newSeriesOpen} onOpenChange={setNewSeriesOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    className="h-9 shrink-0 border-line"
                    aria-label="سری جدید"
                  >
                    <Plus className="size-4" />
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
        </Field>
        <Field label="تعداد افراد">
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
            className="h-9 border-line bg-surface"
          />
        </Field>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="h-9 px-3 text-ink-2 hover:text-ink"
        >
          {advancedOpen ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
          <span>تنظیمات بیشتر</span>
        </Button>
      </div>

      {suggestion && !seriesId && (
        <button
          type="button"
          onClick={() => setSeriesId(suggestion.series_id)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand underline-offset-2 hover:underline"
          dir={dirOf(suggestion.name)}
        >
          <Sparkles className="size-3" />
          <span>
            پیشنهاد سری: «{suggestion.name}» ({Math.round(suggestion.score)}%)
          </span>
        </button>
      )}

      {advancedOpen && (
        <div className="mt-5 space-y-4 border-t border-line-soft pt-5">
          <div className="space-y-1.5">
            <label
              htmlFor="meeting-brief"
              className="text-[11px] font-medium text-ink-3"
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
              className="border-line bg-surface"
            />
            <p className="text-[11px] leading-5 text-ink-4">
              این متن به مدل خلاصه‌ساز پاس داده می‌شود و برای نگاشت اسامی افراد به
              صداها استفاده می‌شود. روی رونوشت اثری نمی‌گذارد.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-ink-3">
              برچسب‌ها
            </label>
            <div className="flex min-h-9 flex-wrap items-center gap-1.5">
              {(tagsList ?? []).length === 0 ? (
                <span className="text-[11px] text-ink-4">
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

          {seriesId && seriesById[seriesId] && (
            <p className="text-[11px] text-ink-3">
              لحن ایمیل سری انتخاب‌شده:{" "}
              <span className="font-medium text-ink">
                {seriesById[seriesId]!.email_tone === "formal"
                  ? "رسمی"
                  : "خودمانی"}
              </span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium text-ink-3">
        {label}
      </span>
      {children}
    </label>
  );
}
