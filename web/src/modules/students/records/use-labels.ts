import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAcademyScope } from "@/modules/auth";
import { labelsQueryKey, type Label } from "@/modules/labels";
import { setStudentRecordsLabel } from "./labels";
import { studentRecordQueryKey, studentsRootKey } from "./queries";
import type { StudentListResult, StudentRecord } from "./types";

const UNREACHABLE = "Could not reach the server. Check your connection and try again.";
const withLabel = (labelIds: string[], labelId: string, on: boolean) => {
  const others = labelIds.filter((id) => id !== labelId);
  return on ? [...others, labelId] : others;
};

/** Label writes on annual records and the cache work around them. Results reach the UI only while the same academy is active. */
export function useStudentLabels(academyId: string) {
  const cache = useQueryClient();
  const isCurrent = useAcademyScope();
  // Record and label pairs being written: one pair never has two writes racing each other.
  const sending = useRef(new Set<string>());
  const deleted = useRef(false);
  const [bulkPending, setBulkPending] = useState(false);

  const listKey = useMemo(() => [...studentsRootKey(academyId), "list"], [academyId]);
  const detailKey = useMemo(() => [...studentsRootKey(academyId), "detail"], [academyId]);

  const refresh = useCallback(() => {
    void cache.invalidateQueries({ queryKey: listKey });
    void cache.invalidateQueries({ queryKey: detailKey });
  }, [cache, detailKey, listKey]);

  const show = useCallback((recordIds: string[], labelId: string, on: boolean) => {
    const ids = new Set(recordIds);
    cache.setQueriesData<StudentListResult>({ queryKey: listKey }, (page) => page && {
      ...page, rows: page.rows.map((row) => ids.has(row.id) ? { ...row, labelIds: withLabel(row.labelIds, labelId, on) } : row),
    });
    for (const id of recordIds) {
      cache.setQueryData<StudentRecord>(studentRecordQueryKey(academyId, id), (record) => record && { ...record, labelIds: withLabel(record.labelIds, labelId, on) });
    }
  }, [academyId, cache, listKey]);

  /** Sends one write. `atOnce` shows it before the server answers and undoes only that label on failure. */
  const write = useCallback(async (recordIds: string[], labelId: string, applied: boolean, atOnce: boolean) => {
    const keys = recordIds.map((id) => `${id}:${labelId}`);
    if (keys.some((key) => sending.current.has(key))) {
      if (!atOnce && isCurrent(academyId)) toast.error("Another change to this label is still saving. Try again in a moment.");
      return false;
    }
    for (const key of keys) sending.current.add(key);
    // A request already running would otherwise overwrite the change when it finishes.
    const settle = () => Promise.all([cache.cancelQueries({ queryKey: listKey }), cache.cancelQueries({ queryKey: detailKey })]);
    let succeeded = false;
    let message: string | null = null;
    try {
      if (atOnce) { await settle(); show(recordIds, labelId, applied); }
      const result = await setStudentRecordsLabel({ academyId, recordIds, labelId, applied });
      if (result.ok) {
        succeeded = true;
        if (!atOnce) { await settle(); show(recordIds, labelId, applied); }
      } else {
        message = result.message;
        if (result.code === "label_not_found") void cache.invalidateQueries({ queryKey: labelsQueryKey(academyId, "students") });
      }
    } catch {
      message = UNREACHABLE;
    } finally {
      for (const key of keys) sending.current.delete(key);
      if (!succeeded && atOnce) show(recordIds, labelId, !applied);
      if (message && isCurrent(academyId)) toast.error(message);
      // Refreshing between quick changes would bring back the state before the later ones.
      if (sending.current.size === 0) refresh();
    }
    return succeeded && isCurrent(academyId);
  }, [academyId, cache, detailKey, isCurrent, listKey, refresh, show]);

  const applyToRecord = useCallback((recordId: string, labelId: string, applied: boolean) => write([recordId], labelId, applied, true), [write]);

  /** Waits for the server before showing anything, so a rejected selection never appears applied. */
  const applyToSelection = useCallback(async (recordIds: string[], labelId: string, applied: boolean) => {
    setBulkPending(true);
    try {
      return await write(recordIds, labelId, applied, false);
    } finally {
      setBulkPending(false);
    }
  }, [write]);

  // Names and colors resolve from the catalog, so only a deletion that removed uses can change results.
  const definitionChanges = useMemo(() => ({
    onLabelChange: (_labelId: string, label: Label | null) => { if (!label) deleted.current = true; },
    onChanged: () => { if (deleted.current) { deleted.current = false; refresh(); } },
  }), [refresh]);

  return { applyToRecord, applyToSelection, bulkPending, definitionChanges };
}
