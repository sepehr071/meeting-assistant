"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioLines, LogOut, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/app/auth-provider";

const NAV = [
  { href: "/", label: "جلسات", match: (p: string) => p === "/" || (p.startsWith("/meetings") && !/^\/meetings\/[^/]+$/.test(p)) },
  { href: "/series", label: "سری‌ها", match: (p: string) => p.startsWith("/series") },
  { href: "/tags", label: "برچسب‌ها", match: (p: string) => p.startsWith("/tags") },
];

export function TopNav() {
  const pathname = usePathname() ?? "/";
  const { user, logout } = useAuth();

  // Hide nav on auth pages and meeting detail (own shell).
  if (pathname === "/login" || pathname === "/register") return null;
  if (/^\/meetings\/[^/]+$/.test(pathname)) {
    return null;
  }

  const initial = user?.username?.[0]?.toUpperCase() ?? "؟";

  return (
    <header
      className="sticky top-0 z-40 w-full border-b border-line bg-surface/85 backdrop-blur"
      style={{ backdropFilter: "saturate(1.1) blur(8px)" }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center px-7">
        <Link
          href="/"
          className="group inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight"
        >
          <span
            className="grid size-7 place-items-center rounded-md text-white shadow-sm transition-transform group-hover:scale-105"
            style={{
              background:
                "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)",
              boxShadow: "0 1px 2px rgba(80,60,160,0.25)",
            }}
          >
            <AudioLines className="size-[15px]" />
          </span>
          <span>دستیار جلسه</span>
        </Link>

        <nav className="me-9 flex items-center gap-0.5">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-md px-3.5 py-2 text-[13px] transition-colors",
                  active
                    ? "font-semibold text-ink"
                    : "text-ink-3 hover:text-ink-2",
                )}
              >
                {item.label}
                {active && (
                  <span
                    className="absolute -bottom-px h-0.5 rounded-full bg-ink"
                    style={{ insetInline: 14 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ms-auto flex items-center gap-2.5">
          <button
            type="button"
            aria-label="جستجو"
            className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-ink-2 transition-colors hover:bg-bg-soft"
          >
            <Search className="size-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="حساب کاربری"
              className="grid size-8 place-items-center rounded-full text-white text-xs font-semibold outline-none ring-offset-2 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ink/30"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.7 0.10 270), oklch(0.55 0.14 285))",
              }}
            >
              {initial}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8}>
              {user && (
                <DropdownMenuLabel className="font-normal">
                  <div className="text-[12px] text-ink-3">وارد شده به‌عنوان</div>
                  <div className="truncate text-[13px] font-medium text-ink">
                    {user.username}
                  </div>
                </DropdownMenuLabel>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  void logout();
                }}
                className="text-red-600 focus:text-red-700"
              >
                <LogOut className="size-3.5" />
                خروج
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
