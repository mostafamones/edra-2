import { useCallback, useMemo, useRef } from "react";
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

  const listKey = useMemo(() => [...studentsRootKey(academyId), "list"], [academyId]);
  const detailKey = useMemo(() => [...studentsRootKey(academyId), "detail"], [academyId]);

  const refresh = useCallback(() => {
    void cache.invalidateQueries({ queryKey: listKey });
    void cache.invalidateQueries({ queryKey: detailKey });
  }, [cache, detailKey, listKey]);

  /** Shows a label's state on cached records and returns the ones that actually changed, so an undo touches only those. */
  const show = useCallback((recordIds: string[], labelId: string, on: boolean) => {
    const ids = new Set(recordIds);
    const changed = new Set<string>();
    const update = <T extends { id: string; labelIds: string[] }>(record: T): T => {
      if (!ids.has(record.id) || record.labelIds.includes(labelId) === on) return record;
      changed.add(record.id);
      return { ...record, labelIds: withLabel(record.labelIds, labelId, on) };
    };
    cache.setQueriesData<StudentListResult>({ queryKey: listKey }, (page) => page && { ...page, rows: page.rows.map(update) });
    for (const id of recordIds) {
      cache.setQueryData<StudentRecord>(studentRecordQueryKey(academyId, id), (record) => record && update(record));
    }
    return [...changed];
  }, [academyId, cache, listKey]);

  /**
   * Sends one write, shown before the server answers. On failure only the records it changed get that
   * label back as it was; their other labels and records that already matched stay as they are.
   */
  const write = useCallback(async (recordIds: string[], labelId: string, applied: boolean) => {
    const keys = recordIds.map((id) => `${id}:${labelId}`);
    if (keys.some((key) => sending.current.has(key))) {
      // A repeated click on one record is dropped quietly; a selection is told why nothing happened.
      if (recordIds.length > 1 && isCurrent(academyId)) toast.error("Another change to this label is still saving. Try again in a moment.");
      return false;
    }
    for (const key of keys) sending.current.add(key);
    // A request already running would otherwise overwrite the change when it finishes.
    const settle = () => Promise.all([cache.cancelQueries({ queryKey: listKey }), cache.cancelQueries({ queryKey: detailKey })]);
    let succeeded = false;
    let message: string | null = null;
    let shown: string[] = [];
    try {
      await settle();
      shown = show(recordIds, labelId, applied);
      const result = await setStudentRecordsLabel({ academyId, recordIds, labelId, applied });
      if (result.ok) {
        succeeded = true;
      } else {
        message = result.message;
        if (result.code === "label_not_found") void cache.invalidateQueries({ queryKey: labelsQueryKey(academyId, "students") });
      }
    } catch {
      message = UNREACHABLE;
    } finally {
      for (const key of keys) sending.current.delete(key);
      if (!succeeded) show(shown, labelId, !applied);
      if (message && isCurrent(academyId)) toast.error(message);
      // Refreshing between quick changes would bring back the state before the later ones.
      if (sending.current.size === 0) refresh();
    }
    return succeeded && isCurrent(academyId);
  }, [academyId, cache, detailKey, isCurrent, listKey, refresh, show]);

  const applyToRecord = useCallback((recordId: string, labelId: string, applied: boolean) => write([recordId], labelId, applied), [write]);
  const applyToSelection = useCallback((recordIds: string[], labelId: string, applied: boolean) => write(recordIds, labelId, applied), [write]);

  // Names and colors resolve from the catalog, so only a deletion that removed uses can change results.
  const definitionChanges = useMemo(() => ({
    onLabelChange: (_labelId: string, label: Label | null) => { if (!label) deleted.current = true; },
    onChanged: () => { if (deleted.current) { deleted.current = false; refresh(); } },
  }), [refresh]);

  return { applyToRecord, applyToSelection, definitionChanges };
}
