"use client";

import { createContext, useContext, useEffect, useEffectEvent, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";

import { academyQueryKeys, listUserAcademies, type AcademyEntry } from "@/modules/academies";
import { purgeAssignmentDrafts } from "@/modules/assignments/browser";
import { installExamSignOutCleanup, setExamJournalAccount } from "@/modules/exams/browser";
import { clearBrowserQueryCache } from "@/lib/query-client";
import { createClient } from "@/lib/supabase/client";
import type { Platform } from "@/lib/routing";

import { AuthLoadError } from "./load-error";
import { AuthLoadingOverlay } from "./loading-overlay";
import { MembershipGuard } from "./membership-guard";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: string | null;
  academies: AcademyEntry[];
  academiesLoading: boolean;
  academiesError: Error | null;
  retryAcademies: () => void;
  /** Reloads memberships (for example after joining an academy) and selects `preferredId` if present. */
  refreshAcademies: (preferredId?: string) => Promise<void>;
  activeAcademy: AcademyEntry | null;
  setActiveAcademy: (academy: AcademyEntry) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
export const LAST_ACADEMY_SLUG_COOKIE = "edra_last_academy_slug";
const LAST_ACADEMY_KEY = "edra_last_academy_id";

function readPreferredAcademyId() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_ACADEMY_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children, initialPlatform }: { children: React.ReactNode; initialPlatform?: Platform | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [preferredAcademyId, setPreferredAcademyId] = useState<string | null>(readPreferredAcademyId);

  const refreshRoute = useEffectEvent(() => router.refresh());

  useEffect(() => {
    let mounted = true;
    let initialized = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let receivedAuthEvent = false;
    let previousUserId: string | null = null;
    let identityEpoch = 0;
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

    const applySession = (nextSession: Session | null) => {
      const nextUserId = nextSession?.user.id ?? null;
      void setExamJournalAccount(nextUserId);
      purgeAssignmentDrafts(nextUserId);
      const accountChanged = initialized && previousUserId !== nextUserId;
      initialized = true;
      previousUserId = nextUserId;

      if (accountChanged) {
        clearBrowserQueryCache();
        setPreferredAcademyId(null);
        try { window.localStorage.removeItem(LAST_ACADEMY_KEY); } catch { /* Storage may be unavailable. */ }
        // Auth callbacks run while Supabase holds its session lock. Refresh once
        // after the callback returns, only for an actual identity transition.
        if (!refreshTimer) refreshTimer = setTimeout(() => {
          refreshTimer = undefined;
          if (mounted) refreshRoute();
        }, 0);
      }

      setSession(nextSession);
      setAuthError(null);
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      receivedAuthEvent = true;
      identityEpoch += 1;
      applySession(nextSession);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted || receivedAuthEvent) return;
      applySession(error ? null : data.session);
      setAuthError(error?.message ?? null);
    }).catch((error: unknown) => {
      if (!mounted || receivedAuthEvent) return;
      setAuthError(error instanceof Error ? error.message : "Unable to load your session.");
      setLoading(false);
    });

    let inFlight = false;
    let lastCheck = 0;
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    const revalidate = async () => {
      if (!mounted || inFlight) return;
      if (Date.now() - lastCheck < 1500) {
        if (!scheduled) scheduled = setTimeout(() => { scheduled = undefined; if (mounted) void revalidate(); }, 1500);
        return;
      }
      inFlight = true;
      lastCheck = Date.now();
      const startedAtEpoch = identityEpoch;
      try {
        // Browser storage events do not cross platform origins. Read shared cookies
        // on focus and navigation, then verify identity with the auth server.
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) return;
        const candidate = sessionData.session;
        const { data: verified, error: userError } = candidate
          ? await supabase.auth.getUser()
          : { data: { user: null }, error: null };
        if (!mounted || identityEpoch !== startedAtEpoch || userError) return;
        const next = verified.user && candidate?.user.id === verified.user.id ? candidate : null;
        applySession(next);
      } catch {
        // Transient connectivity does not invent a signed-out state.
      } finally {
        inFlight = false;
      }
    };
    const removeSignOutCleanup = installExamSignOutCleanup();
    const visible = () => { if (document.visibilityState === "visible") void revalidate(); };
    window.addEventListener("focus", revalidate);
    window.addEventListener("edra-session-revalidate", revalidate);
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted = false;
      subscription.unsubscribe();
      removeSignOutCleanup();
      if (scheduled) clearTimeout(scheduled);
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("edra-session-revalidate", revalidate);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  useEffect(() => { window.dispatchEvent(new Event("edra-session-revalidate")); }, [pathname]);

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

  const refreshAcademies = async (preferredId?: string) => {
    const { data } = await academiesQuery.refetch();
    if (!preferredId || !data?.some((entry) => entry.id === preferredId)) return;
    setPreferredAcademyId(preferredId);
    try { window.localStorage.setItem(LAST_ACADEMY_KEY, preferredId); } catch { /* Storage may be unavailable. */ }
  };

  const academiesLoading = Boolean(user && academiesQuery.isPending);
  const isAppRoute = pathname === "/app" || pathname.startsWith("/app/") || (initialPlatform === "staff" && !/^(?:\/auth|\/onboarding|\/invite)(?:\/|$)/.test(pathname));
  // Academy membership is authorized by the server per URL; only the session gates rendering here.
  const waiting = loading && isAppRoute;
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
      refreshAcademies,
      activeAcademy,
      setActiveAcademy,
    }}>
      {isAppRoute && loading ? null : isAppRoute && loadError ? (
        <AuthLoadError message={loadError} onRetry={() => window.location.reload()} retrying={false} />
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

/** The server-authorized URL academy overrides remembered client selection. */
export function ScopedAcademyProvider({ academy, children }: { academy: AcademyEntry; children: React.ReactNode }) {
  const parent = useAuth();
  // Remember the last academy so the entry URL can reopen it (read server-side from this cookie).
  useEffect(() => {
    document.cookie = `${LAST_ACADEMY_SLUG_COOKIE}=${encodeURIComponent(academy.slug)}; path=/; max-age=31536000; samesite=lax`;
  }, [academy.slug]);
  // This provider mounts only after server membership validation. Rendering it
  // with a key prevents local forms and in-flight features crossing URL scopes.
  return <AuthContext.Provider key={`${parent.user?.id ?? "pending"}:${academy.id}`} value={{ ...parent, activeAcademy: academy }}>
    <MembershipGuard key={`${parent.user?.id ?? "pending"}:${academy.id}`} academy={academy} userId={parent.user?.id} role={academy.role}
      otherAcademies={parent.academies.some((entry) => entry.id !== academy.id)}>{children}</MembershipGuard>
  </AuthContext.Provider>;
}
