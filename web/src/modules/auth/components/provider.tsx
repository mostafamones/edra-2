"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";

import { academyQueryKeys, listUserAcademies, type AcademyEntry } from "@/modules/academies";
import { clearBrowserQueryCache } from "@/lib/query-client";
import { createClient } from "@/lib/supabase/client";

import { AuthLoadError } from "./load-error";
import { AuthLoadingOverlay } from "./loading-overlay";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: string | null;
  academies: AcademyEntry[];
  academiesLoading: boolean;
  academiesError: Error | null;
  retryAcademies: () => void;
  activeAcademy: AcademyEntry | null;
  setActiveAcademy: (academy: AcademyEntry) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const LAST_ACADEMY_KEY = "edra_last_academy_id";

function readPreferredAcademyId() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_ACADEMY_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [preferredAcademyId, setPreferredAcademyId] = useState<string | null>(readPreferredAcademyId);

  useEffect(() => {
    let mounted = true;
    let receivedAuthEvent = false;
    let previousUserId: string | null = null;
    let supabase: ReturnType<typeof createClient>;

    try {
      supabase = createClient();
    } catch {
      queueMicrotask(() => {
        if (!mounted) return;
        setAuthError("Supabase is not configured.");
        setLoading(false);
      });
      return () => { mounted = false; };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      receivedAuthEvent = true;
      const nextUserId = nextSession?.user.id ?? null;
      const accountChanged = previousUserId !== null && previousUserId !== nextUserId;
      previousUserId = nextUserId;

      if (event === "SIGNED_OUT" || accountChanged) {
        clearBrowserQueryCache();
        setPreferredAcademyId(null);
        try { window.localStorage.removeItem(LAST_ACADEMY_KEY); } catch { /* Storage may be unavailable. */ }
      }

      setSession(nextSession);
      setAuthError(null);
      setLoading(false);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted || receivedAuthEvent) return;
      previousUserId = data.session?.user.id ?? null;
      setSession(error ? null : data.session);
      setAuthError(error?.message ?? null);
      setLoading(false);
    }).catch((error: unknown) => {
      if (!mounted || receivedAuthEvent) return;
      setAuthError(error instanceof Error ? error.message : "Unable to load your session.");
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const user = session?.user ?? null;
  const academiesQuery = useQuery({
    queryKey: academyQueryKeys.forUser(user?.id ?? ""),
    queryFn: () => listUserAcademies(user!.id),
    enabled: Boolean(user),
  });
  const academies = user ? academiesQuery.data ?? [] : [];
  const activeAcademy =
    academies.find((academy) => academy.id === preferredAcademyId) ?? academies[0] ?? null;

  const setActiveAcademy = (academy: AcademyEntry) => {
    if (!academies.some((entry) => entry.id === academy.id)) return;
    setPreferredAcademyId(academy.id);
    try { window.localStorage.setItem(LAST_ACADEMY_KEY, academy.id); } catch { /* Storage may be unavailable. */ }
  };

  const academiesLoading = Boolean(user && academiesQuery.isPending);
  const authLoading = loading || academiesLoading;
  const isAppRoute = pathname === "/app" || pathname.startsWith("/app/");
  const waiting = authLoading && isAppRoute;
  const loadError = authError;

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      authError,
      academies,
      academiesLoading,
      academiesError: academiesQuery.error,
      retryAcademies: () => { void academiesQuery.refetch(); },
      activeAcademy,
      setActiveAcademy,
    }}>
      {isAppRoute && authLoading ? null : isAppRoute && loadError ? (
        <AuthLoadError message={loadError} onRetry={() => window.location.reload()} retrying={false} />
      ) : isAppRoute && academiesQuery.isError ? (
        <AuthLoadError message="Your academies could not be loaded." onRetry={() => { void academiesQuery.refetch(); }} retrying={academiesQuery.isFetching} />
      ) : children}
      <AnimatePresence>
        {waiting && <AuthLoadingOverlay key="auth-loader" />}
      </AnimatePresence>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
