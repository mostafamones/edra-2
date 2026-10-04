"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  IconAlertCircle, IconAlertTriangle, IconCircleCheck, IconListDetails, IconPencil, IconSearch, IconSearchOff, IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Toggle } from "@/components/ui/toggle";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import type { Group, Level, Track } from "@/modules/groups";
import { DiscardDialog } from "../../components/discard-dialog";
import { StudentsPagination } from "../../components/table/pagination";
import type { StudentFormValues, StudentRecordInput } from "../../validation";
import { FORM_FIELDS, rowFormValues, validateCorrection, type FieldErrors } from "../corrections";
import { DEFAULT_ROW_PARAMS, type ImportRowParams } from "../params";
import type { ImportField, ImportRow } from "../types";
import { fetchImportRows, importRowsQueryKey } from "../queries";
import { ImportRowsTable } from "./rows-table";

export type ImportCorrectionOptions = {
  academicYearId: string;
  levels: Level[];
  tracks: Track[];
  levelNames: Record<string, string>;
  groups: Group[];
  /** Saves corrected rows in order and returns the ordinals that saved. */
  onSave: (changes: { ordinal: number; input: StudentRecordInput }[]) => Promise<number[]>;
  /** Reports unsaved inline corrections, so confirming can wait for them. */
  onCorrectingChange: (correcting: boolean) => void;
};

const SEARCH_DELAY = 300;

type Props = {
  academyId: string;
  sessionId: string;
  mode: "review" | "results";
  rowWord: "row" | "item";
  onRemove?: (ordinals: number[]) => Promise<boolean>;
  /** Opens the in-app correction for a row. */
  onEdit?: (row: ImportRow) => void;
  /** Entries that failed validation; enables the "only invalid" toggle in review. */
  invalidCount?: number;
  /** Enables correction mode, where invalid fields are edited in the table. */
  correction?: ImportCorrectionOptions;
  disabled?: boolean;
};

const fieldOf = Object.fromEntries(Object.entries(FORM_FIELDS).map(([field, form]) => [form, field])) as Record<keyof StudentFormValues, ImportField>;

/** Search, status filter, the paginated rows table, and its pagination for one import session. */
export function ImportRowsSection({ academyId, sessionId, mode, rowWord, onRemove, onEdit, invalidCount, correction, disabled }: Props) {
  const [params, setParams] = useState<ImportRowParams>({ ...DEFAULT_ROW_PARAMS, status: mode === "review" && onRemove ? "entries" : null });
  const [selected, setSelected] = useState(new Set<number>());
  const [removing, setRemoving] = useState(false);
  async function remove() {
    if (!onRemove || !selected.size) return;
    setRemoving(true);
    try { if (await onRemove([...selected])) setSelected(new Set()); }
    finally { setRemoving(false); }
  }
  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (draft.trim() === params.search) return;
    const timer = setTimeout(() => setParams((current) => ({ ...current, search: draft.trim(), pageIndex: 0 })), SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [draft, params.search]);

  const query = useQuery({
    queryKey: importRowsQueryKey(academyId, sessionId, params),
    queryFn: ({ signal }) => fetchImportRows(academyId, sessionId, params, signal),
    placeholderData: keepPreviousData,
  });
  const page = query.data;
  const onlyInvalid = params.status === "invalid";

  // Correction mode keeps unsaved values per row, across pages and searches, until they are saved.
  const [correcting, setCorrecting] = useState(false);
  const [drafts, setDrafts] = useState(new Map<number, StudentFormValues>());
  // Fields the user chose a value for, even one equal to the staged value (an unresolved group set to Unassigned).
  const [touched, setTouched] = useState(new Map<number, ReadonlySet<keyof StudentFormValues>>());
  const [errors, setErrors] = useState(new Map<number, FieldErrors>());
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const onCorrectingChange = correction?.onCorrectingChange;
  useEffect(() => { onCorrectingChange?.(correcting); }, [correcting, onCorrectingChange]);
  // Once every invalid entry is resolved, return to the full list.
  if ((correcting || onlyInvalid) && invalidCount === 0 && drafts.size === 0 && !saving) {
    setCorrecting(false);
    setParams((current) => ({ ...current, status: "entries", pageIndex: 0 }));
  }

  function change(row: ImportRow, values: Partial<StudentFormValues>) {
    const initial = rowFormValues(row);
    const next = { ...(drafts.get(row.ordinal) ?? initial), ...values };
    const nextTouched = new Set([...(touched.get(row.ordinal) ?? []), ...(Object.keys(values) as (keyof StudentFormValues)[])]);
    const resolves = [...nextTouched].some((key) => row.issues.some((issue) => issue.field === fieldOf[key]));
    const nextDrafts = new Map(drafts);
    const nextTouchedMap = new Map(touched);
    if (!resolves && (Object.keys(next) as (keyof StudentFormValues)[]).every((key) => next[key] === initial[key])) {
      nextDrafts.delete(row.ordinal);
      nextTouchedMap.delete(row.ordinal);
    } else {
      nextDrafts.set(row.ordinal, next);
      nextTouchedMap.set(row.ordinal, nextTouched);
    }
    setDrafts(nextDrafts);
    setTouched(nextTouchedMap);
    const rowErrors = errors.get(row.ordinal);
    if (rowErrors) {
      const remaining = { ...rowErrors };
      for (const key of Object.keys(values) as (keyof StudentFormValues)[]) delete remaining[fieldOf[key]];
      const nextErrors = new Map(errors);
      if (Object.keys(remaining).length) nextErrors.set(row.ordinal, remaining); else nextErrors.delete(row.ordinal);
      setErrors(nextErrors);
    }
  }

  function stopCorrecting() {
    setDrafts(new Map());
    setTouched(new Map());
    setErrors(new Map());
    setCorrecting(false);
    setLeaving(false);
  }

  async function save() {
    if (!correction || !drafts.size) return;
    const changes: { ordinal: number; input: StudentRecordInput }[] = [];
    const failed = new Map<number, FieldErrors>();
    for (const [ordinal, values] of drafts) {
      const result = validateCorrection(values, { academyId, academicYearId: correction.academicYearId }, correction);
      if (result.ok) changes.push({ ordinal, input: result.input });
      else failed.set(ordinal, result.errors);
    }
    setErrors(failed);
    if (!changes.length) {
      toast.error(`Fix the highlighted fields in ${failed.size.toLocaleString("en")} ${failed.size === 1 ? "entry" : "entries"} before saving.`);
      return;
    }
    setSaving(true);
    try {
      const saved = new Set(await correction.onSave(changes));
      setDrafts((current) => new Map([...current].filter(([ordinal]) => !saved.has(ordinal))));
      setTouched((current) => new Map([...current].filter(([ordinal]) => !saved.has(ordinal))));
      if (saved.size) toast.success(`${saved.size.toLocaleString("en")} ${saved.size === 1 ? "entry" : "entries"} corrected`);
      if (failed.size) toast.error(`${failed.size.toLocaleString("en")} ${failed.size === 1 ? "entry still needs" : "entries still need"} fixes.`);
    } finally {
      setSaving(false);
    }
  }
  // A correction or exclusion can empty the last page; move back to the last page with rows.
  const [checkedPage, setCheckedPage] = useState(page);
  if (page !== checkedPage) {
    setCheckedPage(page);
    if (page && !query.isPlaceholderData && page.rows.length === 0 && page.total > 0) {
      const last = Math.max(0, Math.ceil(page.total / params.pageSize) - 1);
      if (last !== params.pageIndex) setParams((current) => ({ ...current, pageIndex: last }));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-sm">
          <InputGroupInput
            type="search"
            placeholder="Search entries"
            aria-label={`Search ${rowWord}s`}
            maxLength={100}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <InputGroupAddon><IconSearch /></InputGroupAddon>
        </InputGroup>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {correcting && drafts.size > 0 && <>
            <span className="text-sm text-muted-foreground">{drafts.size.toLocaleString("en")} unsaved</span>
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => { setDrafts(new Map()); setErrors(new Map()); }}>Discard</Button>
            <Button size="sm" disabled={disabled || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save corrections"}</Button>
          </>}
          {!correcting && selected.size > 0 && <>
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Button variant="ghost" size="sm" disabled={removing} onClick={() => setSelected(new Set())}>Clear</Button>
            <Button variant="destructive" size="sm" disabled={disabled || removing || query.isFetching} onClick={() => void remove()}><IconTrash />{removing ? "Deleting…" : "Delete entries"}</Button>
          </>}
          {mode === "review" && correction && onlyInvalid && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle
                  variant="outline"
                  pressed={correcting}
                  disabled={saving || (!correcting && invalidCount === 0)}
                  onPressedChange={(pressed) => {
                    if (!pressed) { if (drafts.size) setLeaving(true); else stopCorrecting(); return; }
                    setSelected(new Set());
                    setCorrecting(true);
                  }}
                  aria-label="Correction mode"
                >
                  <IconPencil />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Correction mode</TooltipContent>
            </Tooltip>
          )}
          {mode === "review" && invalidCount !== undefined && (
            <Toggle
              variant="outline"
              pressed={onlyInvalid}
              disabled={correcting || (!onlyInvalid && invalidCount === 0)}
              onPressedChange={(pressed) => { setSelected(new Set()); setParams((current) => ({ ...current, status: pressed ? "invalid" : "entries", pageIndex: 0 })); }}
              aria-label={`Show only invalid ${rowWord === "row" ? "entries" : "items"}`}
            >
              <IconAlertTriangle />Invalid only{invalidCount > 0 && <Badge variant="destructive" className="ml-1 h-5 px-1.5 tabular-nums">{invalidCount.toLocaleString("en")}</Badge>}
            </Toggle>
          )}
        </div>
      </div>

      {query.isError && (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>{page ? "Couldn’t refresh the rows" : "Couldn’t load the rows"}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Check your connection and try again.
            <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? "Retrying…" : "Retry"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {page && page.rows.length === 0 && !query.isError ? (
        <RowsEmpty
          rowWord={rowWord}
          mode={mode}
          searching={Boolean(params.search)}
          onlyInvalid={onlyInvalid}
          onClearSearch={() => { setDraft(""); setParams((current) => ({ ...current, search: "", pageIndex: 0 })); }}
          onShowAll={() => setParams((current) => ({ ...current, status: "entries", pageIndex: 0 }))}
        />
      ) : (
        <ImportRowsTable
          rows={page?.rows ?? []}
          loading={!page && !query.isError}
          fetching={query.isFetching && Boolean(page)}
          mode={mode}
          rowWord={rowWord}
          selected={selected}
          onSelectionChange={onRemove && !correcting ? setSelected : undefined}
          onEdit={correcting ? undefined : onEdit}
          correction={correcting && correction ? { ...correction, drafts, touched, errors, onChange: change } : undefined}
          disabled={disabled || removing || saving || query.isPlaceholderData}
        />
      )}

      {page && page.total > 0 && (
        <StudentsPagination
          pageIndex={params.pageIndex}
          pageSize={params.pageSize}
          total={page.total}
          onPageChange={(pageIndex) => setParams((current) => ({ ...current, pageIndex }))}
          onPageSizeChange={(pageSize) => setParams((current) => ({ ...current, pageSize, pageIndex: 0 }))}
        />
      )}
      <DiscardDialog open={leaving} onOpenChange={setLeaving} onDiscard={stopCorrecting}
        description="Your corrections haven’t been saved and will be lost when you leave correction mode." />
    </div>
  );
}

type EmptyProps = {
  rowWord: "row" | "item";
  mode: "review" | "results";
  searching: boolean;
  onlyInvalid: boolean;
  onClearSearch: () => void;
  onShowAll: () => void;
};

/** Replaces the table when a page has no rows. */
function RowsEmpty({ rowWord, mode, searching, onlyInvalid, onClearSearch, onShowAll }: EmptyProps) {
  const copy = searching
    ? { icon: IconSearchOff, title: `No matching ${rowWord}s`, description: `Try a different search, or clear it to see every ${rowWord}.` }
    : onlyInvalid
      ? { icon: IconCircleCheck, title: "No invalid entries", description: `Every ${rowWord} passes validation.` }
      : { icon: IconListDetails, title: `No ${rowWord}s to show`, description: mode === "review" ? `Every ${rowWord} has been removed from this import.` : `This import has no ${rowWord}s.` };
  const Icon = copy.icon;
  return (
    <Empty className="min-h-48 rounded-xl border border-dashed border-border bg-card/20 py-14">
      <EmptyHeader className="gap-1">
        <EmptyMedia variant="icon"><Icon aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>{copy.title}</EmptyTitle>
        <EmptyDescription>{copy.description}</EmptyDescription>
      </EmptyHeader>
      {(searching || onlyInvalid) && (
        <EmptyContent>
          <Button size="sm" variant="outline" onClick={searching ? onClearSearch : onShowAll}>{searching ? "Clear search" : "Show all entries"}</Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
