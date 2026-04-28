"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>برچسب‌ها</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            dir="auto"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="نام برچسب"
          />
          <Button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
          >
            افزودن
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(data ?? []).map((t) => (
            <Badge
              key={t.id}
              variant="secondary"
              className="cursor-pointer gap-1"
              onClick={() => remove.mutate(t.id)}
              title="کلیک برای حذف"
              dir={dirOf(t.name)}
            >
              {t.name}
              <span className="text-xs text-muted-foreground">
                ({t.meeting_count})
              </span>
            </Badge>
          ))}
          {(data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">برچسبی موجود نیست</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
