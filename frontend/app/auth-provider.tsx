"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";

import { authMe, UnauthorizedError, type User } from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_ROUTES = new Set(["/login"]);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  const { data, isLoading } = useQuery<User | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        return await authMe();
      } catch (e) {
        if (e instanceof UnauthorizedError) return null;
        throw e;
      }
    },
    staleTime: 30_000,
    retry: false,
  });

  const user = data ?? null;

  // Client-side redirect: if loaded and unauthenticated on a protected page,
  // bounce to /login (which offers the Keycloak SSO button). Login/logout
  // themselves are full-page navigations to the backend, which reset this.
  useEffect(() => {
    if (isLoading) return;
    if (!user && !PUBLIC_ROUTES.has(pathname)) {
      router.replace("/login");
    }
  }, [isLoading, user, pathname, router]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading: isLoading }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
