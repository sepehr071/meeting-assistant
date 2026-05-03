import { TagManager } from "@/components/tag-manager";

export default function TagsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-7 px-6 py-8" dir="rtl">
      <header>
        <p className="text-xs font-semibold tracking-wide text-brand">
          سازمان‌دهی
        </p>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight text-ink">
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
