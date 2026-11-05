import { useCallback, useLayoutEffect, useRef } from "react";
import { browserScopeGeneration } from "@/lib/browser-scope";

/** Local UI effects must survive neither an unmount nor an account/preview transition. */
export function useConcernFence() {
  const mounted = useRef(false);
  const generation = browserScopeGeneration();
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return useCallback(() => mounted.current && generation === browserScopeGeneration(), [generation]);
}
