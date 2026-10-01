import { TagManager } from "@/components/tag-manager";

export default function TagsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-7 px-4 py-6 sm:px-6 sm:py-8" dir="rtl">
      <header>
        <p className="text-xs font-semibold tracking-wide text-brand">
          سازمان‌دهی
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">
          برچسب‌ها
        </h1>
        <p className="mt-1.5 text-[13.5px] text-ink-3">
          برچسب‌های آزاد برای دسته‌بندی متقاطع جلسات.
        </p>
      </header>
      <TagManager />
    </main>
  );
}
