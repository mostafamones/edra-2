"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { changeParams, readParams, writeParams, type AssessmentListParams } from "./params";

/** Type, search, filters, order and page live in the URL; changes other than paging return to page 1. */
export function useAssessmentParams() {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const params = useMemo(() => readParams(new URLSearchParams(query)), [query]);
  const latest = useRef(params);
  useEffect(() => { latest.current = params; }, [params]);

  const update = useCallback((change: Partial<AssessmentListParams>) => {
    const next = changeParams(latest.current, change);
    latest.current = next;
    const text = writeParams(next).toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  }, [router, pathname]);

  return [params, update, query] as const;
}
