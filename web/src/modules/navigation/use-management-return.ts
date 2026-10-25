"use client";

import { useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { internalStaffPath, staffAcademyPath, validateReturnDestination } from "@/lib/routing";

/** Only return to a workspace page in the current academy, never back into settings. */
export function managementReturnPath(slug: string, value: unknown): string {
  const fallback = staffAcademyPath(slug);
  const destination = validateReturnDestination(value, "staff");
  if (!destination || destination.platform !== "staff") return fallback;
  const { pathname } = new URL(destination.path, "https://routing.invalid");
  if (pathname !== fallback && !pathname.startsWith(`${fallback}/`)) return fallback;
  const internal = internalStaffPath(pathname, slug);
  return internal === "/app/manage" || internal.startsWith("/app/manage/") ? fallback : destination.path;
}

/** Per-tab storage survives reloads and Developer mode's full identity navigation. */
export function useManagementReturn(slug: string | undefined, pathname: string, management: boolean) {
  const search = useSearchParams().toString();
  const key = `edra:management-return:${slug}`;
  useEffect(() => {
    if (!slug || management) return;
    try {
      sessionStorage.setItem(key, managementReturnPath(slug, window.location.pathname + window.location.search));
    } catch {
      // Storage may be unavailable; Back still has the academy root as a fallback.
    }
  }, [slug, key, pathname, search, management]);

  return useCallback(() => {
    if (!slug) return "/";
    try {
      return managementReturnPath(slug, sessionStorage.getItem(key));
    } catch {
      return staffAcademyPath(slug);
    }
  }, [slug, key]);
}
