import * as React from "react";

interface PanelHeaderProps {
  kicker: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PanelHeader({
  kicker,
  title,
  subtitle,
  actions,
}: PanelHeaderProps) {
  return (
    <header className="mb-6" dir="rtl">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-brand">
            {kicker}
          </p>
          <h1 className="mt-1 text-[28px] font-bold leading-[1.25] tracking-tight text-ink">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-[13.5px] text-ink-3">{subtitle}</p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </header>
  );
}
