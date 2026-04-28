"use client";

export function LiveCaptions({
  committed,
  partial,
}: {
  committed: string;
  partial: string;
}) {
  return (
    <div
      dir="rtl"
      className="font-sans text-base leading-loose space-y-2 max-h-64 overflow-y-auto p-4 rounded-md bg-muted/50"
    >
      {committed ? (
        <p className="text-foreground whitespace-pre-wrap">{committed}</p>
      ) : null}
      {partial ? (
        <p className="text-muted-foreground italic">{partial}</p>
      ) : null}
      {!committed && !partial ? (
        <p className="text-muted-foreground">منتظر گفتار...</p>
      ) : null}
    </div>
  );
}
