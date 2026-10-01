import { SeriesManager } from "@/components/series-manager";

export default function SeriesPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-7 px-4 py-6 sm:px-6 sm:py-8" dir="rtl">
      <header>
        <p className="text-xs font-semibold tracking-wide text-brand">
          سازمان‌دهی
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">
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
