"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioLines } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "جلسات", match: (p: string) => p === "/" || p.startsWith("/meetings") },
  { href: "/series", label: "سری‌ها", match: (p: string) => p.startsWith("/series") },
  { href: "/tags", label: "برچسب‌ها", match: (p: string) => p.startsWith("/tags") },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/85 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="group inline-flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
            <AudioLines className="size-4" />
          </span>
          <span className="hidden sm:inline">دستیار جلسه</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {NAV.map((item) => {
            const active = item.match(pathname ?? "");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-md px-3 py-1.5 transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-px h-px bg-primary" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
