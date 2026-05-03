"use client";

import { useQuery } from "@tanstack/react-query";

import { getStats, type Stats } from "@/lib/api";
import { cn } from "@/lib/utils";

function toFa(n: number): string {
  return n.toLocaleString("fa-IR");
}

function formatHours(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
}

interface KpiProps {
  value: string;
  label: string;
  trend?: string | null;
  sub?: string;
  accent?: string;
  mono?: boolean;
  loading?: boolean;
}

function Kpi({ value, label, trend, sub, accent, mono, loading }: KpiProps) {
  return (
    <div className="rounded-xl border border-line-soft bg-bg-soft px-4 py-3.5">
      <div className="flex items-baseline gap-1.5">
        {loading ? (
          <span className="block h-7 w-12 animate-shimmer rounded" />
        ) : (
          <span
            className={cn(
              "text-2xl font-bold leading-none tracking-tight",
              mono && "font-mono tabular-nums",
            )}
            style={{ color: accent ?? "var(--ink)" }}
          >
            {value}
          </span>
        )}
        {trend && !loading && (
          <span
            className="font-mono text-[10.5px] font-semibold tabular-nums"
            style={{
              color: trend.startsWith("-") ? "var(--ink-4)" : "var(--success)",
            }}
          >
            {trend}
          </span>
        )}
      </div>
      <div className="mt-1.5 text-[11px] text-ink-3">
        {label}
        {sub && <span className="text-ink-4"> · {sub}</span>}
      </div>
    </div>
  );
}

export function StatsStrip() {
  const { data, isLoading } = useQuery<Stats>({
    queryKey: ["stats", 7],
    queryFn: () => getStats(7),
    staleTime: 60_000,
  });

  const meetings = data?.meetings ?? 0;
  const hours = data ? formatHours(data.duration_s) : "0:00";
  const actions = data?.actions ?? 0;
  const decisions = data?.decisions ?? 0;
  const meetingsDelta = data?.meetings_delta;
  const trendStr =
    meetingsDelta === undefined || meetingsDelta === 0
      ? null
      : meetingsDelta > 0
        ? `+${toFa(meetingsDelta)}`
        : toFa(meetingsDelta);

  return (
    <section
      className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"
      dir="rtl"
      aria-label="آمار هفت روز اخیر"
    >
      <Kpi
        loading={isLoading}
        value={toFa(meetings)}
        label="جلسه"
        trend={trendStr}
      />
      <Kpi loading={isLoading} value={hours} label="ساعت" mono />
      <Kpi
        loading={isLoading}
        value={toFa(actions)}
        label="اقدام"
        accent="var(--brand)"
      />
      <Kpi
        loading={isLoading}
        value={toFa(decisions)}
        label="تصمیم"
        accent="var(--success)"
      />
    </section>
  );
}
