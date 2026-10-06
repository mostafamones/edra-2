"use client";

import { newUuid } from "@/lib/uuid";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAcademyScope } from "@/modules/auth";
import { saveAttendanceChanges } from "../actions";
import { attendanceQueryKey } from "../queries";
import type { AttendanceChange, AttendanceEntry, ChangeResult, SheetEntry } from "../types";
import { STATUS_LABELS } from "./labels";

/** Statuses waiting for the server, by annual record id. Kept apart from server data so refetches never drop them. */
export type PendingEdits = Record<string, AttendanceChange["status"]>;

function conflictMessage(conflicts: AttendanceEntry[]) {
  if (conflicts.length !== 1) return `${conflicts.length} students were changed by someone else first. Review the latest values and try again.`;
  const [entry] = conflicts;
  const who = entry.updatedByName ?? "Another staff member";
  return `${who} already marked ${entry.fullName} ${STATUS_LABELS[entry.status].toLowerCase()}. Review and try again.`;
}

/**
 * Versioned draft edits. Each save carries the version the user saw and one idempotency key, reused
 * for an automatic retry after a network failure. A save shows as done only after the server
 * confirms it and the sheet is refetched; a stale version applies nothing and reports the conflict.
 */
export function useAttendanceEdits(academyId: string, sessionId: string) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [pending, setPending] = useState<PendingEdits>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const key = attendanceQueryKey(academyId, sessionId);

  async function save(changes: AttendanceChange[]): Promise<ChangeResult> {
    const idempotencyKey = newUuid();
    const send = () => saveAttendanceChanges({ academyId, sessionId, changes, idempotencyKey });
    let result: ChangeResult;
    try {
      result = await send();
      if (!result.ok && result.code === "unavailable") result = await send();
    } catch {
      try { result = await send(); } catch { result = { ok: false, code: "unavailable", message: "Could not save. Check your connection and try again." }; }
    }
    await queryClient.invalidateQueries({ queryKey: key });
    return result;
  }

  function report(result: ChangeResult, success?: string) {
    if (!isCurrentAcademy(academyId)) return false;
    if (!result.ok) { toast.error(result.message); return false; }
    if (result.outcome === "conflict") { toast.warning(conflictMessage(result.conflicts)); return false; }
    if (success) toast.success(success);
    return true;
  }

  async function setStatus(entry: SheetEntry, status: AttendanceChange["status"]) {
    if (pending[entry.annualStudentRecordId] || entry.status === status) return;
    setPending((current) => ({ ...current, [entry.annualStudentRecordId]: status }));
    try {
      report(await save([{ annualStudentRecordId: entry.annualStudentRecordId, status, expectedVersion: entry.version }]));
    } finally {
      setPending((current) => {
        const next = { ...current };
        delete next[entry.annualStudentRecordId];
        return next;
      });
    }
  }

  /** All or nothing; returns whether every change was saved. */
  async function applyBulk(changes: AttendanceChange[], success: string) {
    if (bulkBusy || changes.length === 0) return false;
    setBulkBusy(true);
    try {
      return report(await save(changes), success);
    } finally {
      setBulkBusy(false);
    }
  }

  return { pending, bulkBusy, setStatus, applyBulk };
}
