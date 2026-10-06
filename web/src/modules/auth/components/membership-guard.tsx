"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { clearStaffInvitation } from "@/modules/staff/join";
import { academyQueryKeys, type AcademyEntry } from "@/modules/academies";

/** Recheck server authority even while a previously authorized layout stays mounted. */
export function MembershipGuard({ academyId, userId, role, children }: {
  academyId: string; userId: string | undefined; role: AcademyEntry["role"]; children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [removed, setRemoved] = useState(false);
  const revalidate = useRef<() => void>(() => {});
  const roleRef = useRef(role);
  useEffect(() => { roleRef.current = role; }, [role]);

  useEffect(() => {
    if (!userId) return;
    const db = createClient();
    let active = true;
    let checking = false;
    let redirecting = false;
    const leave = async () => {
      if (!active || redirecting) return;
      redirecting = true;
      setRemoved(true);
      await queryClient.cancelQueries({ predicate: (query) => query.queryKey.includes(academyId) });
      queryClient.removeQueries({ predicate: (query) => query.queryKey.includes(academyId) });
      void queryClient.invalidateQueries({ queryKey: academyQueryKeys.forUser(userId) });
      document.cookie = "edra_last_academy_slug=; path=/; max-age=0; samesite=lax";
      try { window.localStorage.removeItem("edra_last_academy_id"); } catch { /* Storage may be unavailable. */ }
      try { await clearStaffInvitation(); } catch { /* The onboarding page also checks invite validity. */ }
      if (active) window.location.replace("/onboarding/instructor/join");
    };
    const check = async () => {
      if (!active || checking || redirecting) return;
      checking = true;
      try {
        const { data, error } = await db.from("academy_memberships")
          .select("user_id, role").eq("academy_id", academyId).eq("user_id", userId).maybeSingle();
        if (active && !error && !data) await leave();
        else if (active && !error && data && data.role !== roleRef.current) {
          void queryClient.invalidateQueries({ queryKey: academyQueryKeys.forUser(userId) });
          void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(academyId) });
          router.refresh();
        }
      } catch { /* A connection failure does not mean removal. */ }
      finally { checking = false; }
    };
    revalidate.current = () => { void check(); };
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    const channel = db.channel(`staff-membership:${userId}:${academyId}`, { config: { private: true } })
      .on("broadcast", { event: "staff_removed" }, ({ payload }) => {
        if (payload?.academyId === academyId) void check();
      })
      .on("broadcast", { event: "staff_role_changed" }, ({ payload }) => {
        if (payload?.academyId === academyId) void check();
      });
    void db.realtime.setAuth().then(() => {
      if (active) channel.subscribe((status) => { if (status === "SUBSCRIBED") void check(); });
    }).catch(() => { /* Polling and focus checks cover an unavailable realtime connection. */ });
    void check();
    const interval = setInterval(() => { if (document.visibilityState === "visible") void check(); }, 15000);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      revalidate.current = () => {};
      clearInterval(interval);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
      void db.removeChannel(channel);
    };
  }, [academyId, userId, queryClient, router]);

  useEffect(() => { revalidate.current(); }, [pathname]);
  return removed ? null : children;
}
