"use client";

import { useCallback, useEffect, useRef } from "react";

import { useAuth } from "./components/provider";

/**
 * Lets an async handler ask, after an await, whether the academy it started in is still the active
 * one. Handlers must capture their academy id before awaiting and use `isCurrent(capturedId)` to
 * decide whether to close dialogs, navigate, or touch local state. Cache invalidation should still
 * target the captured academy.
 */
export function useAcademyScope() {
  const { activeAcademy } = useAuth();
  const latest = useRef(activeAcademy?.id ?? null);
  useEffect(() => { latest.current = activeAcademy?.id ?? null; }, [activeAcademy?.id]);
  return useCallback((academyId: string) => latest.current === academyId, []);
}
