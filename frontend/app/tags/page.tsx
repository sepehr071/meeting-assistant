import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TagManager } from "@/components/tag-manager";

export default function TagsPage() {
  return (
    <main className="container mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">مدیریت برچسب‌ها</h1>
        <Link href="/">
          <Button variant="ghost" size="sm">
            بازگشت
          </Button>
        </Link>
      </header>
      <TagManager />
    </main>
  );
}
