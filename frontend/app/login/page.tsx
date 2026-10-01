"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "../auth-provider";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api";

export default function LoginPage() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  function signIn() {
    // Full-page navigation → backend kicks off the Keycloak Auth Code flow.
    window.location.assign(`${API_BASE}/auth/oidc/login`);
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col items-center justify-center px-6">
      <div className="w-full rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-7">
        <h1 className="mb-1.5 text-lg font-semibold text-ink">ورود</h1>
        <p className="mb-6 text-[13px] text-ink-3">
          برای دسترسی به جلسات با حساب سازمانی خود وارد شوید.
        </p>
        <Button type="button" className="w-full" onClick={signIn}>
          ورود با حساب سازمانی
        </Button>
      </div>
    </div>
  );
}
