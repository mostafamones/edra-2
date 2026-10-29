"use client";

import { useSyncExternalStore } from "react";

import { publicHref } from "@/lib/routing";
import { useAuth } from "@/modules/auth";

/** The staff Assessments list remembers its last URL state per tab, so workspaces can return to it. */

type AssessmentType = "assignment" | "quiz" | "exam";
const ROUTE_TYPES: Record<string, AssessmentType> = { assignments: "assignment", quizzes: "quiz", exams: "exam" };
const key = (slug: string) => `edra:assessments-return:${slug}`;

export function rememberAssessmentList(slug: string, query: string) {
  try {
    sessionStorage.setItem(key(slug), new URLSearchParams(query).toString());
  } catch {
    // Without storage, Back opens the list filtered to the item's type.
  }
}

/** The list as last seen in this tab when it shows this type; otherwise the list filtered to this type. */
export function assessmentListReturn(slug: string | undefined, route: string): string {
  const type = ROUTE_TYPES[route];
  const fallback = type ? `/app/assessments?type=${type}` : "/app/assessments";
  if (!slug) return fallback;
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(key(slug));
  } catch {
    return fallback;
  }
  if (stored === null) return fallback;
  const query = new URLSearchParams(stored);
  const listed = query.get("type");
  if (listed !== null && listed !== type) return fallback;
  const text = query.toString();
  return text ? `/app/assessments?${text}` : "/app/assessments";
}

const subscribe = () => () => {};

/** Public href of the Assessments list for a workspace or form of `route` ("assignments", "quizzes" or "exams"). */
export function useAssessmentListReturn(route: string) {
  const slug = useAuth().activeAcademy?.slug;
  const path = useSyncExternalStore(subscribe, () => assessmentListReturn(slug, route), () => assessmentListReturn(undefined, route));
  return publicHref(path, slug);
}
