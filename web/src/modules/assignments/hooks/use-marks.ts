"use client";

import { useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { newUuid } from "@/lib/uuid";
import { loadMarks, marksQueryKey } from "../queries";
import type { Assignment, StudentWork } from "../types";

/** The assignment's students with work and marks, plus a way to patch one row from a command result. */
export function useMarks(assignment: Assignment) {
  const queryClient = useQueryClient();
  const queryKey = marksQueryKey(assignment.academyId, assignment.id, "all");
  const query = useQuery({
    queryKey,
    queryFn: () => loadMarks(assignment.academyId, assignment.id, "all"),
    enabled: assignment.state !== "draft",
  });
  const replace = useCallback((student: StudentWork) => {
    queryClient.setQueryData<{ total: number; students: StudentWork[] }>(queryKey, (current) =>
      current ? { ...current, students: current.students.map((row) => (row.recordId === student.recordId ? { ...student, placement: row.placement } : row)) } : current);
  }, [queryClient, queryKey]);
  return { query, replace, queryKey };
}

/**
 * One idempotency key per distinct payload. A retry of the same unsent or unconfirmed payload
 * reuses its key (the server replays instead of applying twice); a changed payload gets a new key.
 */
export function useAttemptKey() {
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  return {
    keyFor(fingerprint: string): string {
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newUuid() };
      return attempt.current.key;
    },
    reset() { attempt.current = null; },
  };
}
