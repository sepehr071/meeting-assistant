"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AudioLines, LogOut, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/app/auth-provider";

const NAV = [
  { href: "/", label: "جلسات", match: (p: string) => p === "/" || (p.startsWith("/meetings") && !/^\/meetings\/[^/]+$/.test(p)) },
  { href: "/series", label: "سری‌ها", match: (p: string) => p.startsWith("/series") },
  { href: "/tags", label: "برچسب‌ها", match: (p: string) => p.startsWith("/tags") },
];

export function TopNav() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [term, setTerm] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Hide nav on auth pages and meeting detail (own shell).
  if (pathname === "/login" || pathname === "/register") return null;
  if (/^\/meetings\/[^/]+$/.test(pathname)) {
    return null;
  }

  const initial = user?.username?.[0]?.toUpperCase() ?? "؟";

  function handleLogout() {
    setAccountOpen(false);
    // fire-and-forget; do NOT await — avoid any react-query interaction that
    // could throw and block the redirect.
    fetch(
      `${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api"}/auth/logout`,
      { method: "POST", credentials: "include" },
    ).catch(() => {});
    // hard reload guarantees auth state + react-query cache reset
    window.location.assign("/login");
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = term.trim();
    setSearchOpen(false);
    if (q) {
      router.push(`/?q=${encodeURIComponent(q)}`);
    } else {
      router.push("/");
    }
  }

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
          <Popover
            open={searchOpen}
            onOpenChange={(o) => {
              setSearchOpen(o);
              if (o) {
                requestAnimationFrame(() => inputRef.current?.focus());
              }
            }}
          >
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label="جستجو"
                  className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-ink-2 transition-colors hover:bg-bg-soft"
                >
                  <Search className="size-3.5" />
                </button>
              }
            />
            <PopoverContent align="end" className="w-72">
              <form onSubmit={submitSearch} className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  dir="auto"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="جستجو در عناوین جلسات…"
                  className="h-8 flex-1 rounded-md border border-line bg-surface px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <button
                  type="submit"
                  className="grid size-8 place-items-center rounded-md bg-ink text-white transition-opacity hover:opacity-90"
                  aria-label="جستجو"
                >
                  <Search className="size-3.5" />
                </button>
              </form>
            </PopoverContent>
          </Popover>

          <Popover open={accountOpen} onOpenChange={setAccountOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label="حساب کاربری"
                  className="grid size-8 place-items-center rounded-full text-white text-xs font-semibold outline-none ring-offset-2 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ink/30"
                  style={{
                    background:
                      "linear-gradient(135deg, oklch(0.7 0.10 270), oklch(0.55 0.14 285))",
                  }}
                >
                  {initial}
                </button>
              }
            />
            <PopoverContent align="end" className="w-56 p-0">
              {user && (
                <div className="border-b border-line px-3 py-2">
                  <div className="text-[11px] text-ink-3">وارد شده به‌عنوان</div>
                  <div className="truncate text-[13px] font-medium text-ink">
                    {user.username}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-right text-[13px] text-red-600 transition-colors hover:bg-red-50 focus:bg-red-50 focus:outline-none"
              >
                <LogOut className="size-3.5" />
                خروج
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
}
