import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SeriesManager } from "@/components/series-manager";

export default function SeriesPage() {
  return (
    <main className="container mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">مدیریت سری‌ها</h1>
        <Link href="/">
          <Button variant="ghost" size="sm">
            بازگشت
          </Button>
        </Link>
      </header>
      <SeriesManager />
    </main>
  );
}
