"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { staffAcademyHref } from "@/lib/routing";
import { clearStaffInvitation } from "@/modules/staff/join";
import { academyQueryKeys, type AcademyEntry } from "@/modules/academies";
import { SuspendedAccess } from "./suspended-access";

const MEMBERSHIP_EVENTS = ["staff_removed", "staff_role_changed", "staff_suspended", "staff_restored"];

/**
 * Recheck server authority even while a previously authorized layout stays mounted. Realtime events
 * are only hints; every decision comes from a fresh read. Removal leaves for the join page;
 * suspension unmounts the academy (cancelling its queries, channels and pending UI) and shows the
 * suspended state until access is restored. A failed read is never treated as lost access.
 */
export function MembershipGuard({ academy, userId, role, otherAcademies, children }: {
  academy: Pick<AcademyEntry, "id" | "slug" | "name">; userId: string | undefined; role: AcademyEntry["role"];
  /** Whether another active academy remains selectable. */
  otherAcademies: boolean;
  children: ReactNode;
}) {
  const academyId = academy.id;
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [access, setAccess] = useState<"active" | "suspended" | "removed">("active");
  const revalidate = useRef<() => void>(() => {});
  const roleRef = useRef(role);
  useEffect(() => { roleRef.current = role; }, [role]);

  useEffect(() => {
    if (!userId) return;
    const db = createClient();
    let active = true;
    let checking = false;
    let redirecting = false;
    let suspended = false;
    const forget = async () => {
      await queryClient.cancelQueries({ predicate: (query) => query.queryKey.includes(academyId) });
      queryClient.removeQueries({ predicate: (query) => query.queryKey.includes(academyId) });
      void queryClient.invalidateQueries({ queryKey: academyQueryKeys.forUser(userId) });
      document.cookie = "edra_last_academy_slug=; path=/; max-age=0; samesite=lax";
      try { window.localStorage.removeItem("edra_last_academy_id"); } catch { /* Storage may be unavailable. */ }
    };
    const leave = async () => {
      if (!active || redirecting) return;
      redirecting = true;
      setAccess("removed");
      await forget();
      try { await clearStaffInvitation(); } catch { /* The onboarding page also checks invite validity. */ }
      if (active) window.location.replace("/onboarding/instructor/join");
    };
    const suspend = async () => {
      if (!active || suspended) return;
      suspended = true;
      // Unmounting the academy drops its channels and makes late responses out of scope.
      setAccess("suspended");
      await forget();
    };
    const check = async () => {
      if (!active || checking || redirecting) return;
      checking = true;
      try {
        // RLS hides the caller's own row while it is suspended, so a visible row means active.
        const { data, error } = await db.from("academy_memberships")
          .select("user_id, role").eq("academy_id", academyId).eq("user_id", userId)
          .is("suspended_at", null).maybeSingle();
        if (!active || error) return;
        if (data && suspended) {
          // Restored: rebuild the academy from the server rather than reuse cleared state.
          redirecting = true;
          window.location.reload();
        } else if (data && data.role !== roleRef.current) {
          void queryClient.invalidateQueries({ queryKey: academyQueryKeys.forUser(userId) });
          void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(academyId) });
          router.refresh();
        } else if (!data) {
          const { data: own, error: ownError } = await db.rpc("own_suspended_staff_academies");
          if (!active || ownError) return;
          if (own?.some((entry) => entry.id === academyId)) await suspend();
          else await leave();
        }
      } catch { /* A connection failure does not mean removal. */ }
      finally { checking = false; }
    };
    revalidate.current = () => { void check(); };
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    let channel = db.channel(`staff-membership:${userId}:${academyId}`, { config: { private: true } });
    for (const event of MEMBERSHIP_EVENTS) {
      channel = channel.on("broadcast", { event }, ({ payload }) => {
        if (payload?.academyId === academyId) void check();
      });
    }
    void db.realtime.setAuth().then(() => {
      if (active) channel.subscribe((status) => { if (status === "SUBSCRIBED") void check(); });
    }).catch(() => { /* Polling and focus checks cover an unavailable realtime connection. */ });
    void check();
    const interval = setInterval(() => { if (document.visibilityState === "visible") void check(); }, 15000);
    window.addEventListener("focus", visible);
    window.addEventListener("online", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      revalidate.current = () => {};
      clearInterval(interval);
      window.removeEventListener("focus", visible);
      window.removeEventListener("online", visible);
      document.removeEventListener("visibilitychange", visible);
      void db.removeChannel(channel);
    };
  }, [academyId, userId, queryClient, router]);

  useEffect(() => { revalidate.current(); }, [pathname]);
  if (access === "removed") return null;
  if (access === "suspended") {
    return <SuspendedAccess academyName={academy.name} retryHref={staffAcademyHref(academy.slug)}
      otherAcademies={otherAcademies} />;
  }
  return children;
}
