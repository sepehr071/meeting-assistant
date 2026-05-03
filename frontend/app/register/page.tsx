"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "../auth-provider";

export default function RegisterPage() {
  const router = useRouter();
  const { user, register } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    if (password !== confirm) {
      toast.error("رمز عبور و تأیید آن یکسان نیستند");
      return;
    }
    setSubmitting(true);
    try {
      await register(username.trim(), password);
      router.replace("/");
    } catch (err) {
      const msg = (err as Error).message ?? "خطا";
      if (msg.includes("409")) {
        toast.error("این نام کاربری قبلاً گرفته شده است");
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col items-center justify-center px-6">
      <div className="w-full rounded-xl border border-line bg-surface p-7 shadow-sm">
        <h1 className="mb-1.5 text-lg font-semibold text-ink">ثبت‌نام</h1>
        <p className="mb-6 text-[13px] text-ink-3">حساب کاربری بسازید.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] text-ink-2" htmlFor="username">
              نام کاربری
            </label>
            <Input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={80}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] text-ink-2" htmlFor="password">
              رمز عبور (حداقل ۸ کاراکتر)
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] text-ink-2" htmlFor="confirm">
              تأیید رمز عبور
            </label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "در حال ثبت‌نام…" : "ثبت‌نام"}
          </Button>
        </form>
        <p className="mt-5 text-center text-[13px] text-ink-3">
          قبلاً ثبت‌نام کرده‌اید؟{" "}
          <Link href="/login" className="font-medium text-ink underline-offset-2 hover:underline">
            وارد شوید
          </Link>
        </p>
      </div>
    </div>
  );
}
