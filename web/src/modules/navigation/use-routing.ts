"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";
import { internalStaffPath, internalStudentPath, publicHref } from "@/lib/routing";
import { useAuth } from "@/modules/auth";

export function useCanonicalHref() {
  const { activeAcademy } = useAuth();
  return useCallback((internal: string) => publicHref(internal, activeAcademy?.slug), [activeAcademy?.slug]);
}

export function usePortalPath(platform: "staff" | "student") {
  const pathname = usePathname();
  const { activeAcademy } = useAuth();
  return platform === "staff" ? internalStaffPath(pathname, activeAcademy?.slug) : internalStudentPath(pathname);
}
