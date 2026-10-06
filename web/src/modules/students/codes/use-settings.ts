"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/modules/auth";

import { fetchStudentCodeSettings, studentCodeQueryKeys } from "./queries";

/**
 * The academy's code settings for screens that only react to them (menus, buttons). Shares the
 * cache with the settings page; refetches after 30 seconds so a switch made elsewhere shows up.
 */
export function useStudentCodeSettings(academyId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: studentCodeQueryKeys.settings(user?.id ?? "", academyId),
    queryFn: ({ signal }) => fetchStudentCodeSettings(academyId, signal),
    staleTime: 30_000,
    enabled: Boolean(user),
  });
}

/** The format a level's generated codes follow: its override, otherwise the academy default. */
export function effectivePattern(settings: { defaultPattern: string | null; levels: { levelId: string; pattern: string }[] }, levelId: string) {
  return settings.levels.find((level) => level.levelId === levelId)?.pattern ?? settings.defaultPattern;
}
