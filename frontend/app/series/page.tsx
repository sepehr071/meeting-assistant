import { SeriesManager } from "@/components/series-manager";

export default function SeriesPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-7 px-6 py-8" dir="rtl">
      <header>
        <p className="text-xs font-semibold tracking-wide text-brand">
          سازمان‌دهی
        </p>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight text-ink">
          سری‌ها
        </h1>
        <p className="mt-1.5 text-[13.5px] text-ink-3">
          گروه‌بندی جلسات تکراری، واژه‌نامه‌ی مشترک، نام گویندگان و لحن ایمیل.
        </p>
      </header>
      <SeriesManager />
    </main>
  );
}
