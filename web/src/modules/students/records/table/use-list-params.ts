"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { readListParams, writeListParams, type PageSize, type StudentListParams } from "../list-params";

/**
 * Search, filters, sort, and page live in the URL. Invalid values are replaced with defaults.
 * `update` receives the latest parameters, so several changes in one event compose correctly.
 */
export function useListParams(fallbackPageSize: PageSize) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const params = useMemo(
    () => readListParams(new URLSearchParams(queryString), fallbackPageSize).params,
    [queryString, fallbackPageSize],
  );
  const latest = useRef(params);
  useEffect(() => { latest.current = params; }, [params]);

  const update = useCallback((change: (current: StudentListParams) => StudentListParams) => {
    const next = change(latest.current);
    latest.current = next;
    const query = writeListParams(next).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [router, pathname]);

  return [params, update] as const;
}
