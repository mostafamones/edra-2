"use client";

import type { ReactNode } from "react";

import type { AcademyEntry } from "@/modules/academies";

import { useAuth } from "./provider";

/**
 * Renders a feature only for a resolved active academy, and re-mounts it when the academy changes
 * so drafts, dialogs and in-flight UI state never carry over to another academy.
 */
export function AcademyGate({ children }: { children: (academy: AcademyEntry) => ReactNode }) {
  const { activeAcademy } = useAuth();
  if (!activeAcademy) {
    return <main className="p-8" role="alert">No academy is selected. Choose an academy to continue.</main>;
  }
  return <AcademyScope key={activeAcademy.id}>{children(activeAcademy)}</AcademyScope>;
}

function AcademyScope({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
