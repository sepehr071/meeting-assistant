"use client";

import { createContext, useContext, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  authLogin,
  authLogout,
  authMe,
  authRegister,
  UnauthorizedError,
  type User,
} from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  register: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_ROUTES = new Set(["/login", "/register"]);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const qc = useQueryClient();

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
  // bounce to /login. The proxy handles this server-side too, but covers
  // post-logout state without a hard reload.
  useEffect(() => {
    if (isLoading) return;
    if (!user && !PUBLIC_ROUTES.has(pathname)) {
      router.replace("/login");
    }
  }, [isLoading, user, pathname, router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading: isLoading,
      login: async (username, password) => {
        const u = await authLogin(username, password);
        qc.setQueryData(["auth", "me"], u);
        await qc.invalidateQueries();
        return u;
      },
      register: async (username, password) => {
        const u = await authRegister(username, password);
        qc.setQueryData(["auth", "me"], u);
        await qc.invalidateQueries();
        return u;
      },
      logout: async () => {
        await authLogout();
        qc.setQueryData(["auth", "me"], null);
        qc.clear();
        router.replace("/login");
      },
    }),
    [user, isLoading, qc, router],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
