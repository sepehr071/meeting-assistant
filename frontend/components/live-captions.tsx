"use client";

export function LiveCaptions({
  committed,
  partial,
}: {
  committed: string;
  partial: string;
}) {
  const empty = !committed && !partial;
  return (
    <div
      dir="rtl"
      className="relative max-h-64 space-y-2 overflow-y-auto rounded-md border border-border/70 bg-muted/40 px-4 py-3 text-sm leading-7"
    >
      <p
        className="absolute right-3 top-1.5 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        <span
          className="size-1.5 rounded-full bg-primary animate-pulse-dot"
          aria-hidden="true"
        />
        زیرنویس زنده
      </p>
      <div className="pt-5">
        {committed ? (
          <p className="text-foreground whitespace-pre-wrap">{committed}</p>
        ) : null}
        {partial ? (
          <p className="italic text-muted-foreground">{partial}</p>
        ) : null}
        {empty ? (
          <p className="text-muted-foreground">منتظر گفتار…</p>
        ) : null}
      </div>
    </div>
  );
}
