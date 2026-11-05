import { useCallback } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAcademyScope } from "@/modules/auth";
import { studentRecordQueryKey, studentsRootKey } from "./queries";
import { previewStudentSuspension, setStudentSuspension } from "./suspension";
import type { OnlineAccount, StudentListResult, StudentRecord } from "./types";

/** A target as last seen on screen: its profile's suspension, revision and the record's archive state. */
export type SuspensionTarget = { recordId: string; revision: number; suspended: boolean; archived: boolean };

export type SuspensionRequest = {
  /** True suspends online access; false restores it. */
  suspend: boolean;
  targets: SuspensionTarget[];
  /** The student's name for one record; omitted for a selection. */
  name?: string;
  /** Carried back into the dialog after a failed write, so nothing typed is lost. */
  reason?: string;
  error?: string;
  /** Targets that no longer exist, found when a failed write was reloaded. */
  missing?: number;
};

const students = (count: number) => `${count} ${count === 1 ? "student" : "students"}`;
const UNREACHABLE = "Could not reach the server. Check your connection and try again.";

/**
 * Refreshes everything that shows a profile's online access: student lists and details across its
 * annual records, and the learning and content-access projections. Resolves false when a student
 * read on screen failed, so the caller can offer another refresh without repeating the change.
 */
export async function refreshSuspensionViews(queryClient: QueryClient, academyId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: studentsRootKey(academyId) }),
    queryClient.invalidateQueries({ queryKey: ["learning"] }),
    queryClient.invalidateQueries({ queryKey: ["content-access"] }),
  ]);
  return !queryClient.getQueryCache().findAll({ queryKey: studentsRootKey(academyId), type: "active" })
    .some((query) => query.state.status === "error");
}

type Shown = { manuallySuspended: boolean; onlineAccount: OnlineAccount; archivedAt: string | null };
/** Archival still suspends a linked account; an unlinked one stays not connected. */
const withSuspension = <T extends Shown>(record: T, suspended: boolean): T => ({
  ...record,
  manuallySuspended: suspended,
  onlineAccount: record.onlineAccount === "not_connected" ? "not_connected" : suspended || record.archivedAt ? "suspended" : "connected",
});

type Options = {
  /** Reopens the confirmation after a failure, with the reason and the error. */
  reopen: (request: SuspensionRequest) => void;
};

/**
 * Suspension writes, shown before the server answers. A failure undoes exactly what was shown and
 * reopens the confirmation; when the selection changed meanwhile it is reloaded first, so the next
 * confirmation reviews the current state. Results reach the UI only while the same academy is active.
 */
export function useStudentSuspension(academyId: string, { reopen }: Options) {
  const cache = useQueryClient();
  const isCurrent = useAcademyScope();

  /** Shows a state on the cached copies of the targets; returns an undo for exactly those changes. */
  const show = useCallback((recordIds: string[], suspended: boolean) => {
    const ids = new Set(recordIds);
    const before = new Map<string, Shown>();
    const update = <T extends Shown & { id: string }>(record: T): T => {
      if (!ids.has(record.id) || record.manuallySuspended === suspended) return record;
      if (!before.has(record.id)) before.set(record.id, { manuallySuspended: record.manuallySuspended, onlineAccount: record.onlineAccount, archivedAt: record.archivedAt });
      return withSuspension(record, suspended);
    };
    cache.setQueriesData<StudentListResult>({ queryKey: [...studentsRootKey(academyId), "list"] }, (page) => page && { ...page, rows: page.rows.map(update) });
    for (const id of recordIds) cache.setQueryData<StudentRecord>(studentRecordQueryKey(academyId, id), (record) => record && update(record));
    return () => {
      const undo = <T extends Shown & { id: string }>(record: T): T => {
        const previous = before.get(record.id);
        return previous && record.manuallySuspended === suspended ? { ...record, manuallySuspended: previous.manuallySuspended, onlineAccount: previous.onlineAccount } : record;
      };
      cache.setQueriesData<StudentListResult>({ queryKey: [...studentsRootKey(academyId), "list"] }, (page) => page && { ...page, rows: page.rows.map(undo) });
      for (const id of before.keys()) cache.setQueryData<StudentRecord>(studentRecordQueryKey(academyId, id), (record) => record && undo(record));
    };
  }, [academyId, cache]);

  const submit = useCallback(async (request: SuspensionRequest, reason: string) => {
    const targetAcademyId = academyId;
    const recordIds = request.targets.map((target) => target.recordId);
    // A request already running would otherwise overwrite the change when it finishes.
    await cache.cancelQueries({ queryKey: studentsRootKey(targetAcademyId) });
    const undo = show(recordIds, request.suspend);
    let failure: { code: string; message: string };
    try {
      const result = await setStudentSuspension({
        academyId: targetAcademyId,
        records: request.targets.map((target) => ({ id: target.recordId, revision: target.revision })),
        suspended: request.suspend,
        reason,
      });
      if (result.ok) {
        if (!isCurrent(targetAcademyId)) return;
        const { changed, unchanged } = result.data;
        const message = changed.length === 0
          ? `No change: ${request.name ?? students(unchanged.length)} already ${request.suspend ? "suspended" : "not suspended"}.`
          : `${request.suspend ? "Suspended" : "Restored"} online access for ${request.name ?? students(changed.length)}${unchanged.length ? `; ${unchanged.length} unchanged` : ""}.`;
        const refreshed = await refreshSuspensionViews(cache, targetAcademyId);
        if (!isCurrent(targetAcademyId)) return;
        if (refreshed) toast.success(message);
        else toast.warning(`${message} Couldn’t refresh students.`, {
          action: { label: "Refresh", onClick: () => void refreshSuspensionViews(cache, targetAcademyId) },
        });
        return;
      }
      failure = result;
    } catch {
      failure = { code: "unavailable", message: UNREACHABLE };
    }
    undo();
    if (!isCurrent(targetAcademyId)) return;
    let targets = request.targets;
    if (failure.code === "stale_suspension" || failure.code === "not_found") {
      try {
        const fresh = await previewStudentSuspension({ academyId: targetAcademyId, recordIds });
        if (!isCurrent(targetAcademyId)) return;
        if (fresh.ok) targets = fresh.data.map((row) => ({ recordId: row.recordId, revision: row.revision, suspended: row.suspended, archived: row.archived }));
      } catch {
        // Keep the targets; the server rejects them again rather than acting on stale state.
      }
      void cache.invalidateQueries({ queryKey: studentsRootKey(targetAcademyId) });
    }
    reopen({ ...request, targets, reason, error: failure.message, ...(targets.length < recordIds.length ? { missing: recordIds.length - targets.length } : {}) });
  }, [academyId, cache, isCurrent, reopen, show]);

  return { submit };
}
