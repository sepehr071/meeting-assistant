"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  acceptKeyterm,
  addKeyterm,
  createSeries,
  deleteSeries,
  listKeyterms,
  listSeries,
  listSeriesSpeakerNames,
  rejectKeyterm,
  updateSeries,
  type EmailTone,
  type SeriesWithCount,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { dirOf } from "@/lib/rtl";

export function SeriesManager() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const { data: seriesList } = useQuery({
    queryKey: ["series"],
    queryFn: listSeries,
  });

  const create = useMutation({
    mutationFn: () => createSeries({ name: newName.trim() }),
    onSuccess: (s) => {
      setNewName("");
      qc.invalidateQueries({ queryKey: ["series"] });
      setSelectedId(s.id);
      toast.success("سری ایجاد شد");
    },
    onError: (e) => toast.error(String(e)),
  });

  const items = seriesList ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-3" dir="rtl">
        <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
          <p className="text-[11px] font-medium text-ink-3">سری جدید</p>
          <div className="flex gap-2">
            <Input
              dir="auto"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="نام سری"
              className="h-9 border-line"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) create.mutate();
              }}
            />
            <Button
              size="sm"
              onClick={() => create.mutate()}
              disabled={!newName.trim() || create.isPending}
              className="h-9"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="هنوز سری‌ای وجود ندارد"
            hint="نخستین سری را از فرم بالا اضافه کنید."
          />
        ) : (
          <ul className="space-y-1">
            {items.map((s) => {
              const active = selectedId === s.id;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      "w-full rounded-md px-3 py-2 text-start text-sm transition-colors",
                      active
                        ? "bg-brand-soft font-semibold text-brand-ink"
                        : "text-ink-2 hover:bg-bg-soft",
                    )}
                    dir={dirOf(s.name)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{s.name}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-mono tabular-nums",
                          active
                            ? "bg-surface text-ink-3"
                            : "bg-bg-soft text-ink-4",
                        )}
                      >
                        {s.meeting_count.toLocaleString("fa-IR")}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {selectedId ? (
        <SeriesDetail
          series={items.find((s) => s.id === selectedId)}
          onDeleted={() => setSelectedId(null)}
        />
      ) : (
        <EmptyState
          icon={Layers}
          title="یک سری انتخاب کنید"
          hint="برای دیدن واژه‌نامه، نام گویندگان و تنظیمات لحن، روی نام سری کلیک کنید."
        />
      )}
    </div>
  );
}

function SeriesDetail({
  series,
  onDeleted,
}: {
  series: SeriesWithCount | undefined;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  if (!series) return null;

  const update = useMutation({
    mutationFn: (patch: { name?: string; email_tone?: EmailTone }) =>
      updateSeries(series.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["series"] });
      toast.success("به‌روزرسانی شد");
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteSeries(series.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["series"] });
      onDeleted();
      toast.success("حذف شد");
    },
  });

  return (
    <div className="space-y-4" dir="rtl">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="mb-4">
          <h2
            dir={dirOf(series.name)}
            className="text-[18px] font-bold tracking-tight text-ink"
          >
            {series.name}
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">
            {series.meeting_count.toLocaleString("fa-IR")} جلسه ثبت شده
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
          <SeriesNameField
            series={series}
            onSave={(name) => update.mutate({ name })}
          />
          <ToneSelector
            value={series.email_tone}
            onChange={(t) => update.mutate({ email_tone: t })}
          />
          <DeleteSeriesButton
            seriesName={series.name}
            disabled={remove.isPending}
            onConfirm={() => remove.mutate()}
          />
        </div>
      </section>

      <Tabs defaultValue="keyterms">
        <TabsList>
          <TabsTrigger value="keyterms">واژه‌نامه</TabsTrigger>
          <TabsTrigger value="suggested">پیشنهادها</TabsTrigger>
          <TabsTrigger value="speakers">نام گویندگان</TabsTrigger>
        </TabsList>
        <TabsContent value="keyterms" className="pt-3">
          <KeytermsList seriesId={series.id} source="active" />
        </TabsContent>
        <TabsContent value="suggested" className="pt-3">
          <KeytermsList seriesId={series.id} source="suggested" />
        </TabsContent>
        <TabsContent value="speakers" className="pt-3">
          <SpeakerNamesList seriesId={series.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SeriesNameField({
  series,
  onSave,
}: {
  series: SeriesWithCount;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(series.name);
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-ink-3">نام</label>
      <div className="flex gap-2">
        <Input
          dir="auto"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-9 border-line"
        />
        <Button
          variant="outline"
          onClick={() => onSave(value.trim())}
          disabled={!value.trim() || value.trim() === series.name}
          className="h-9 border-line"
        >
          ذخیره
        </Button>
      </div>
    </div>
  );
}

function ToneSelector({
  value,
  onChange,
}: {
  value: EmailTone;
  onChange: (t: EmailTone) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-ink-3">لحن ایمیل</label>
      <div className="inline-flex h-9 rounded-lg border border-line bg-bg-soft p-0.5">
        {(["formal", "casual"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={cn(
              "rounded-md px-3 text-xs font-medium transition-colors",
              value === t
                ? "bg-surface text-ink shadow-card"
                : "text-ink-3 hover:text-ink-2",
            )}
          >
            {t === "formal" ? "رسمی" : "خودمانی"}
          </button>
        ))}
      </div>
    </div>
  );
}

function DeleteSeriesButton({
  seriesName,
  disabled,
  onConfirm,
}: {
  seriesName: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col items-end justify-end gap-1.5">
      <span className="invisible text-[11px]">.</span>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="outline"
              disabled={disabled}
              size="sm"
              className="h-9 border-line"
            >
              <Trash2 className="size-4 text-destructive" />
              <span>حذف</span>
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle dir="rtl">
              حذف سری «{seriesName}»؟
            </AlertDialogTitle>
            <AlertDialogDescription dir="rtl">
              جلسات وابسته از این سری خارج می‌شوند ولی حذف نخواهند شد. واژه‌نامه
              و نام گویندگان از دست می‌روند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              انصراف
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" onClick={onConfirm} />}
            >
              حذف
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KeytermsList({
  seriesId,
  source,
}: {
  seriesId: string;
  source: "active" | "suggested";
}) {
  const qc = useQueryClient();
  const [newTerm, setNewTerm] = useState("");

  const manualQ = useQuery({
    queryKey: ["keyterms", seriesId, "manual"],
    queryFn: () => listKeyterms(seriesId, "manual"),
    enabled: source === "active",
  });
  const acceptedQ = useQuery({
    queryKey: ["keyterms", seriesId, "accepted"],
    queryFn: () => listKeyterms(seriesId, "accepted"),
    enabled: source === "active",
  });
  const suggestedQ = useQuery({
    queryKey: ["keyterms", seriesId, "suggested"],
    queryFn: () => listKeyterms(seriesId, "suggested"),
    enabled: source === "suggested",
  });

  const add = useMutation({
    mutationFn: () => addKeyterm(seriesId, newTerm.trim()),
    onSuccess: () => {
      setNewTerm("");
      qc.invalidateQueries({ queryKey: ["keyterms", seriesId] });
      toast.success("اضافه شد");
    },
    onError: (e) => toast.error(String(e)),
  });

  const accept = useMutation({
    mutationFn: (id: string) => acceptKeyterm(seriesId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["keyterms", seriesId] }),
  });

  const reject = useMutation({
    mutationFn: (id: string) => rejectKeyterm(seriesId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["keyterms", seriesId] }),
  });

  if (source === "suggested") {
    const items = suggestedQ.data ?? [];
    if (items.length === 0) {
      return (
        <div className="rounded-xl border border-line bg-surface px-5 py-8 text-center text-sm text-ink-4">
          پیشنهادی موجود نیست
        </div>
      );
    }
    return (
      <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-line-soft bg-bg-soft px-3.5 py-2"
            dir={dirOf(item.term)}
          >
            <span className="text-sm text-ink">{item.term}</span>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="default"
                onClick={() => accept.mutate(item.id)}
              >
                تأیید
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => reject.mutate(item.id)}
              >
                رد
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const manualItems = manualQ.data ?? [];
  const acceptedItems = acceptedQ.data ?? [];

  return (
    <div className="space-y-5 rounded-xl border border-line bg-surface p-5">
      <div className="flex gap-2">
        <Input
          dir="auto"
          value={newTerm}
          onChange={(e) => setNewTerm(e.target.value)}
          placeholder="افزودن واژه (حداکثر ۵۰ کاراکتر)"
          className="h-9 border-line"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newTerm.trim()) add.mutate();
          }}
        />
        <Button
          onClick={() => add.mutate()}
          disabled={!newTerm.trim() || add.isPending}
          className="h-9"
        >
          <Plus className="size-4" />
          <span>افزودن</span>
        </Button>
      </div>
      <KeytermGroup
        label="دستی"
        items={manualItems}
        toneClass="bg-ink text-white border-ink"
        onRemove={(id) => reject.mutate(id)}
      />
      <KeytermGroup
        label="تأییدشده از پیشنهادها"
        items={acceptedItems}
        toneClass="bg-success/10 text-success border-success/30"
        onRemove={(id) => reject.mutate(id)}
      />
    </div>
  );
}

function KeytermGroup({
  label,
  items,
  toneClass,
  onRemove,
}: {
  label: string;
  items: { id: string; term: string }[];
  toneClass: string;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-ink-3">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.length === 0 ? (
          <span className="text-xs text-ink-4">—</span>
        ) : (
          items.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onRemove(t.id)}
              title="کلیک برای حذف"
              dir={dirOf(t.term)}
              className={cn(
                "group inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-opacity hover:opacity-80",
                toneClass,
              )}
            >
              <span>{t.term}</span>
              <X className="size-3 opacity-60" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function SpeakerNamesList({ seriesId }: { seriesId: string }) {
  const { data } = useQuery({
    queryKey: ["speaker-names", seriesId],
    queryFn: () => listSeriesSpeakerNames(seriesId),
  });
  const items = data ?? [];
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface px-5 py-8 text-center text-sm leading-7 text-ink-4">
        هنوز نامی برای گویندگان ثبت نشده. هنگام تغییر نام گوینده در جلسات این
        سری، نام‌ها به‌طور خودکار اضافه می‌شوند.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap gap-1.5">
        {items.map((name) => (
          <span
            key={name}
            dir={dirOf(name)}
            className="rounded-full border border-line bg-bg-soft px-2.5 py-0.5 text-xs text-ink-2"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
