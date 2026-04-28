import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  hint?: React.ReactNode;
  tone?: "muted" | "destructive";
  className?: string;
  children?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  tone = "muted",
  className,
  children,
}: EmptyStateProps) {
  return (
    <Card className={cn("border-dashed bg-card/40", className)}>
      <CardContent
        className="flex flex-col items-center justify-center gap-2 py-10 text-center"
        dir="rtl"
      >
        {Icon && (
          <span
            className={cn(
              "grid size-10 place-items-center rounded-full",
              tone === "destructive"
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
          </span>
        )}
        <p
          className={cn(
            "text-sm font-medium",
            tone === "destructive" ? "text-destructive" : "text-foreground",
          )}
        >
          {title}
        </p>
        {hint && (
          <p className="max-w-sm text-xs leading-6 text-muted-foreground">
            {hint}
          </p>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
