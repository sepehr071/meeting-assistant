"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Tag as TagIcon, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";

import { createTag, deleteTag, listTags } from "@/lib/api";
import { dirOf } from "@/lib/rtl";

export function TagManager() {
  const qc = useQueryClient();
  const [name, setName] = useState("");

  const { data } = useQuery({ queryKey: ["tags"], queryFn: listTags });

  const create = useMutation({
    mutationFn: () => createTag(name.trim()),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["tags"] });
      toast.success("برچسب اضافه شد");
    },
    onError: (e) => toast.error(String(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });

  const items = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">همه‌ی برچسب‌ها</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex gap-2">
          <Input
            dir="auto"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="نام برچسب"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) create.mutate();
            }}
          />
          <Button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
          >
            <Plus className="size-4" />
            <span>افزودن</span>
          </Button>
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon={TagIcon}
            title="برچسبی موجود نیست"
            hint="نخستین برچسب را از فرم بالا اضافه کنید."
          />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {items.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => remove.mutate(t.id)}
                  className="group inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm transition-colors hover:border-destructive/50 hover:bg-destructive/5"
                  dir={dirOf(t.name)}
                  title="کلیک برای حذف"
                >
                  <span>{t.name}</span>
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                    {t.meeting_count}
                  </span>
                  <X className="size-3 text-muted-foreground transition-colors group-hover:text-destructive" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
