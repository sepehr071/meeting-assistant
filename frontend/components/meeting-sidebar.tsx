"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckSquare,
  CircleHelp,
  ClipboardList,
  FileText,
  Gavel,
  HelpCircle,
  Mail,
  MessageCircle,
  RefreshCw,
  Share2,
  Sparkles,
  Users,
  Clock,
} from "lucide-react";

import { MeetingStatus } from "@/components/meeting-status";
import { cn } from "@/lib/utils";
import { dirOf, formatJalali } from "@/lib/rtl";

export interface SidebarTab {
  id: string;
  label: string;
  icon: keyof typeof ICON_MAP;
  count?: number | null;
  accent?: boolean;
}

const ICON_MAP = {
  sparkles: Sparkles,
  check: CheckSquare,
  gavel: Gavel,
  help: HelpCircle,
  circleQ: CircleHelp,
  mail: Mail,
  doc: ClipboardList,
  list: FileText,
  chat: MessageCircle,
} as const;

interface MeetingSidebarProps {
  meetingId: string;
  title: string;
  duration: string | null;
  speakerCount: number | null;
  createdAt: string | null;
  active: string;
  onSelect: (id: string) => void;
  counts: Record<string, number | null | undefined>;
  initialStatus?: import("@/lib/api").MeetingStatus;
  onShare?: () => void;
  onRegenerate?: () => void;
  regenDisabled?: boolean;
  regenPending?: boolean;
}

const GROUPS: Array<{
  label: string;
  items: SidebarTab[];
}> = [
  {
    label: "بینش‌ها",
    items: [
      { id: "summary", label: "خلاصه", icon: "sparkles" },
      { id: "actions", label: "اقدامات", icon: "check" },
      { id: "decisions", label: "تصمیم‌ها", icon: "gavel" },
      { id: "qa", label: "پرسش‌وپاسخ", icon: "help" },
      { id: "open", label: "مسائل باز", icon: "circleQ" },
    ],
  },
  {
    label: "خروجی‌ها",
    items: [
      { id: "email", label: "پیش‌نویس ایمیل", icon: "mail" },
      { id: "minutes", label: "صورتجلسه", icon: "doc" },
    ],
  },
  {
    label: "منابع",
    items: [
      { id: "transcript", label: "رونوشت", icon: "list" },
      { id: "chat", label: "چت با جلسه", icon: "chat", accent: true },
    ],
  },
];

export function MeetingSidebar({
  meetingId,
  title,
  duration,
  speakerCount,
  createdAt,
  active,
  onSelect,
  counts,
  initialStatus,
  onShare,
  onRegenerate,
  regenDisabled,
  regenPending,
}: MeetingSidebarProps) {
  return (
    <aside
      className="flex w-64 shrink-0 flex-col border-l border-line bg-surface"
      dir="rtl"
    >
      <div className="border-b border-line px-4 py-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-3 transition-colors hover:text-ink"
        >
          <ArrowRight className="size-3" />
          همه جلسات
        </Link>
        <h2
          dir={title ? dirOf(title) : "rtl"}
          className="mt-2 line-clamp-2 text-[15px] font-bold leading-snug tracking-tight text-ink"
        >
          {title || "—"}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-4">
          {duration && (
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Clock className="size-3" />
              {duration}
            </span>
          )}
          {speakerCount != null && (
            <>
              <span aria-hidden="true">•</span>
              <span className="inline-flex items-center gap-1">
                <Users className="size-3" />
                {speakerCount.toLocaleString("fa-IR")} گوینده
              </span>
            </>
          )}
          {createdAt && (
            <>
              <span aria-hidden="true">•</span>
              <span>{formatJalali(createdAt)}</span>
            </>
          )}
        </div>
        <div className="mt-2.5">
          <MeetingStatus meetingId={meetingId} initialStatus={initialStatus} />
        </div>
      </div>

      <nav
        className="flex-1 overflow-y-auto px-2.5 py-3 scroll-thin"
        aria-label="بخش‌های جلسه"
      >
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-2.5">
            <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
              {group.label}
            </div>
            <div className="flex flex-col gap-px">
              {group.items.map((t) => {
                const Icon = ICON_MAP[t.icon];
                const isActive = active === t.id;
                const count = counts[t.id];
                return (
                  <button
                    key={t.id}
                    onClick={() => onSelect(t.id)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-start text-[13px] transition-colors",
                      isActive && t.accent
                        ? "bg-gradient-to-l from-indigo-500/15 to-violet-500/15 font-semibold text-brand-ink"
                        : isActive
                          ? "bg-brand-soft font-semibold text-brand-ink"
                          : t.accent
                            ? "text-brand hover:bg-bg-soft"
                            : "text-ink-2 hover:bg-bg-soft",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-3.5",
                        t.accent && !isActive && "text-brand",
                      )}
                    />
                    <span className="flex-1">{t.label}</span>
                    {count != null && count > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-px font-mono text-[10px] tabular-nums",
                          isActive
                            ? "bg-surface text-ink-3"
                            : "bg-line-soft text-ink-3",
                        )}
                      >
                        {count.toLocaleString("fa-IR")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex gap-1.5 border-t border-line p-3">
        <button
          type="button"
          onClick={onShare}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-bg-soft text-xs text-ink-2 transition-colors hover:bg-line-soft"
        >
          <Share2 className="size-3" />
          اشتراک
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenDisabled}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-bg-soft text-xs text-ink-2 transition-colors hover:bg-line-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            className={cn("size-3", regenPending && "animate-spin")}
          />
          بازتولید
        </button>
      </div>
    </aside>
  );
}
