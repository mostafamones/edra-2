"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { loadMarks, marksQueryKey } from "../queries";
import type { Assignment, StudentWork } from "../types";

/** The assignment's students with work and marks, plus a way to patch one row from a command result. */
export function useMarks(assignment: Assignment) {
  const queryClient = useQueryClient();
  const queryKey = marksQueryKey(assignment.academyId, assignment.id, "all");
  const query = useQuery({
    queryKey,
    queryFn: () => loadMarks(assignment.academyId, assignment.id, "all"),
  });
  const replace = useCallback((student: StudentWork) => {
    queryClient.setQueryData<{ total: number; students: StudentWork[] }>(queryKey, (current) =>
      current ? { ...current, students: current.students.map((row) => (row.recordId === student.recordId ? { ...student, placement: row.placement } : row)) } : current);
  }, [queryClient, queryKey]);
  return { query, replace, queryKey };
}
