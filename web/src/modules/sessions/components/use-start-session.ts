"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { newUuid } from "@/lib/uuid";
import { useAcademyScope } from "@/modules/auth";
import { useCanonicalHref } from "@/modules/navigation";
import { startSession } from "../actions";
import { sessionsRootKey } from "../queries";

/**
 * Starts (or opens the live) session for a schedule and navigates to its details page. A start key
 * is kept per schedule until the server answers, so retrying after a lost response returns the
 * same session instead of creating another.
 */
export function useStartSession(academyId: string) {
  const router = useRouter();
  const href = useCanonicalHref();
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const keys = useRef(new Map<string, string>());
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function start(scheduleId: string) {
    if (pendingId) return;
    const targetAcademyId = academyId;
    const startKey = keys.current.get(scheduleId) ?? newUuid();
    keys.current.set(scheduleId, startKey);
    setPendingId(scheduleId);
    try {
      const result = await startSession({ academyId: targetAcademyId, scheduleId, startKey });
      if (!result.ok) {
        // Only a lost response keeps the key for a retry; definite answers start fresh next time.
        if (result.code !== "unavailable") keys.current.delete(scheduleId);
        if (isCurrentAcademy(targetAcademyId)) toast.error(result.message);
        return;
      }
      keys.current.delete(scheduleId);
      await queryClient.invalidateQueries({ queryKey: sessionsRootKey(targetAcademyId) });
      if (!isCurrentAcademy(targetAcademyId)) return;
      if (result.outcome === "existing") toast.info("This class is already live. Opened its session.");
      // A retried start returns the session it made, even if someone archived it since; that session
      // stays archived and read-only. Starting the class again uses a new key.
      if (result.outcome === "replayed" && result.archived) {
        toast.info("This start already opened a session that has since been archived. Showing it read-only; start the class again for a new session.");
      }
      router.push(href(`/app/attendance/${result.sessionId}`));
    } catch {
      if (isCurrentAcademy(targetAcademyId)) toast.error("Could not start the session. Check your connection and try again.");
    } finally {
      setPendingId(null);
    }
  }

  return { start, pendingId };
}
