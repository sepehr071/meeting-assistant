import { TagManager } from "@/components/tag-manager";

export default function TagsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">برچسب‌ها</h1>
        <p className="text-sm text-muted-foreground">
          برچسب‌های آزاد برای دسته‌بندی متقاطع جلسات.
        </p>
      </header>
      <TagManager />
    </main>
  );
}
