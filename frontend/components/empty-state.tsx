import * as React from "react";
import type { LucideIcon } from "lucide-react";

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
    <div
      className={cn(
        "rounded-2xl border border-dashed border-line bg-bg-soft/60",
        className,
      )}
    >
      <div
        className="flex flex-col items-center justify-center gap-2.5 px-6 py-10 text-center"
        dir="rtl"
      >
        {Icon && (
          <span
            className={cn(
              "grid size-11 place-items-center rounded-full",
              tone === "destructive"
                ? "bg-destructive/10 text-destructive"
                : "bg-brand-soft text-brand",
            )}
          >
            <Icon className="size-5" />
          </span>
        )}
        <p
          className={cn(
            "text-sm font-medium",
            tone === "destructive" ? "text-destructive" : "text-ink",
          )}
        >
          {title}
        </p>
        {hint && (
          <p className="max-w-sm text-xs leading-6 text-ink-3">{hint}</p>
        )}
        {children}
      </div>
    </div>
  );
}
