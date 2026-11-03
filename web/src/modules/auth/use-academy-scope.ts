import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { browserScopeGeneration } from "@/lib/browser-scope";

import { useAuth } from "./components/provider";

/**
 * Lets an async handler ask, after an await, whether the academy it started in is still the active
 * one. Handlers must capture their academy id before awaiting and use `isCurrent(capturedId)` to
 * decide whether to close dialogs, navigate, or touch local state. Cache invalidation should still
 * target the captured academy.
 */
export function useAcademyScope() {
  const { activeAcademy, user } = useAuth();
  const generation = browserScopeGeneration();
  const captured = useMemo(() => ({ academyId: activeAcademy?.id ?? null, userId: user?.id ?? null, generation }), [activeAcademy?.id, user?.id, generation]);
  const latest = useRef<typeof captured | null>(captured);
  useLayoutEffect(() => {
    latest.current = captured;
    return () => { latest.current = null; };
  }, [captured]);
  return useCallback((academyId: string) => latest.current === captured && captured.academyId === academyId && captured.generation === browserScopeGeneration(), [captured]);
}
