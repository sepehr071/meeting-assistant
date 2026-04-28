import { SeriesManager } from "@/components/series-manager";

export default function SeriesPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">سری‌ها</h1>
        <p className="text-sm text-muted-foreground">
          گروه‌بندی جلسات تکراری، واژه‌نامه‌ی مشترک، نام گویندگان و لحن ایمیل.
        </p>
      </header>
      <SeriesManager />
    </main>
  );
}
