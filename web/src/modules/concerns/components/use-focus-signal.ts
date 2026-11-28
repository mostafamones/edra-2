import { newUuid } from "@/lib/uuid";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";
import type { ConcernScope } from "../queries";

/** Separates this tab's heartbeat from the account's other tabs; the account comes from the session. */
const TAB_ID = typeof crypto !== "undefined" ? newUuid() : null;
export const FOCUS_HEARTBEAT_MS = 20_000;

/**
 * While this concern is open in the panel AND the document is visible AND the window has focus,
 * tells the server so ordinary message push is suppressed for this account (mentions and lifecycle
 * still push). The server ignores heartbeats older than 45 s, so a closed or crashed tab never
 * suppresses permanently; leaving, collapsing, blurring or hiding clears it at once.
 */
export function useConcernFocusSignal(scope: ConcernScope, concernId: string, active: boolean) {
  const { academyId } = scope;
  useEffect(() => {
    if (!active || !TAB_ID) return;
    const db = createClient();
    let reported = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const report = (focused: boolean) => {
      if (!focused && !reported) return;
      reported = focused;
      // A null concern clears this tab; generated argument types omit nullability.
      void Promise.resolve(db.rpc("set_concern_focus", { p_academy_id: academyId, p_concern_id: (focused ? concernId : null) as string, p_client_id: TAB_ID }))
        .catch(() => undefined);
    };
    const update = () => {
      const focused = document.visibilityState === "visible" && document.hasFocus();
      clearInterval(timer);
      report(focused);
      if (focused) timer = setInterval(() => report(true), FOCUS_HEARTBEAT_MS);
    };
    update();
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
      clearInterval(timer);
      report(false);
    };
  }, [active, academyId, concernId]);
}
