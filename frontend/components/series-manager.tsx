"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    onSuccess: () => {
      setNewName("");
      qc.invalidateQueries({ queryKey: ["series"] });
      toast.success("سری ایجاد شد");
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>سری‌ها</CardTitle>
          <CardDescription>گروه جلسات تکراری</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              dir="auto"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="نام سری"
            />
            <Button
              onClick={() => create.mutate()}
              disabled={!newName.trim() || create.isPending}
            >
              افزودن
            </Button>
          </div>
          <div className="space-y-1">
            {(seriesList ?? []).map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`w-full rounded-md px-3 py-2 text-start text-sm transition-colors ${
                  selectedId === s.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
                dir={dirOf(s.name)}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{s.name}</span>
                  <Badge variant="secondary">{s.meeting_count}</Badge>
                </div>
              </button>
            ))}
            {seriesList?.length === 0 && (
              <p className="text-sm text-muted-foreground">هنوز سری‌ای وجود ندارد</p>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedId ? (
        <SeriesDetail
          series={seriesList?.find((s) => s.id === selectedId)}
          onDeleted={() => setSelectedId(null)}
        />
      ) : (
        <Card>
          <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            یک سری از فهرست انتخاب کنید
          </CardContent>
        </Card>
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle dir={dirOf(series.name)}>{series.name}</CardTitle>
          <CardDescription>
            تعداد جلسات: {series.meeting_count}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <SeriesNameField series={series} onSave={(name) => update.mutate({ name })} />
          <ToneSelector
            value={series.email_tone}
            onChange={(t) => update.mutate({ email_tone: t })}
          />
          <Button
            variant="destructive"
            className="ms-auto"
            onClick={() => {
              if (
                window.confirm(
                  "حذف سری؟ جلسات وابسته از سری خارج می‌شوند ولی حذف نخواهند شد.",
                )
              ) {
                remove.mutate();
              }
            }}
            disabled={remove.isPending}
          >
            حذف
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="keyterms">
        <TabsList>
          <TabsTrigger value="keyterms">واژه‌نامه</TabsTrigger>
          <TabsTrigger value="suggested">پیشنهادها</TabsTrigger>
          <TabsTrigger value="speakers">نام گویندگان</TabsTrigger>
        </TabsList>
        <TabsContent value="keyterms">
          <KeytermsList seriesId={series.id} source="active" />
        </TabsContent>
        <TabsContent value="suggested">
          <KeytermsList seriesId={series.id} source="suggested" />
        </TabsContent>
        <TabsContent value="speakers">
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
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">نام</label>
      <div className="flex gap-2">
        <Input
          dir="auto"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          variant="secondary"
          onClick={() => onSave(value.trim())}
          disabled={!value.trim() || value.trim() === series.name}
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
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">لحن ایمیل</label>
      <div className="flex gap-1">
        {(["formal", "casual"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={value === t ? "default" : "outline"}
            onClick={() => onChange(t)}
          >
            {t === "formal" ? "رسمی" : "خودمانی"}
          </Button>
        ))}
      </div>
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
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">پیشنهادی موجود نیست</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-md border p-2"
              >
                <span dir={dirOf(item.term)}>{item.term}</span>
                <div className="flex gap-2">
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
            ))
          )}
        </CardContent>
      </Card>
    );
  }

  const manualItems = manualQ.data ?? [];
  const acceptedItems = acceptedQ.data ?? [];

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex gap-2">
          <Input
            dir="auto"
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            placeholder="افزودن واژه (حداکثر ۵۰ کاراکتر)"
          />
          <Button
            onClick={() => add.mutate()}
            disabled={!newTerm.trim() || add.isPending}
          >
            افزودن
          </Button>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">دستی</p>
          <div className="flex flex-wrap gap-1">
            {manualItems.map((t) => (
              <Badge
                key={t.id}
                variant="default"
                className="cursor-pointer"
                onClick={() => reject.mutate(t.id)}
                title="کلیک برای حذف"
              >
                {t.term}
              </Badge>
            ))}
            {manualItems.length === 0 && (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">تأییدشده از پیشنهادها</p>
          <div className="flex flex-wrap gap-1">
            {acceptedItems.map((t) => (
              <Badge
                key={t.id}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => reject.mutate(t.id)}
                title="کلیک برای حذف"
              >
                {t.term}
              </Badge>
            ))}
            {acceptedItems.length === 0 && (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SpeakerNamesList({ seriesId }: { seriesId: string }) {
  const { data } = useQuery({
    queryKey: ["speaker-names", seriesId],
    queryFn: () => listSeriesSpeakerNames(seriesId),
  });
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        {(data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            هنوز نامی برای گویندگان ثبت نشده. هنگام تغییر نام گوینده در جلسات این سری به‌طور خودکار اضافه می‌شود.
          </p>
        ) : (
          (data ?? []).map((name) => (
            <Badge key={name} variant="outline" dir={dirOf(name)}>
              {name}
            </Badge>
          ))
        )}
      </CardContent>
    </Card>
  );
}
