import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, AlertCircleIcon, Archive02Icon, SearchRemoveIcon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { useCanonicalHref } from "@/modules/navigation";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Link from "@/components/shared/link";
import { useSearchParams } from "@/lib/navigation";
import { z } from "zod";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getCoreRowModel, useReactTable, type ColumnSizingState, type Updater, type VisibilityState,
} from "@tanstack/react-table";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { HeaderActions } from "@/components/shared/header-actions";
import { SidebarIcon } from "@/components/shared/sidebar-icon";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OverlayPanel } from "@/components/ui/overlay-panel";
import { AcademyGate, useAuth } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { GroupsBoard, groupListQueryKey, loadGroups, loadStructure, structureQueryKey } from "@/modules/groups";
import { canManageLabels, LabelManager, useLabels, type Label } from "@/modules/labels";
import {
  clampPageIndex, DEFAULT_PAGE_SIZE, isFiltering, NONE, type PageSize, type SortDescriptor, type StudentListParams,
} from "../list-params";
import { canApplyStudentLabels, canArchiveStudentRecords, canChangeStudentGroups, canImportStudents } from "../permissions";
import { fetchStudentList, studentListQueryKey } from "../queries";
import type { GroupChangeRow, RecordVersion, StudentRecordRow } from "../types";
import { ACTIONS_COLUMN, CODE_COLUMN, SELECT_COLUMN } from "../table/config";
import { defaultLayout, withColumnAt, type TablePreferences } from "../table/preferences";
import { bulkTargets, pageSelectionState, selectionScope, syncSelection, togglePage, toggleRow, type Selection } from "../table/selection";
import { useListParams } from "../table/use-list-params";
import { useTablePreferences } from "../table/use-preferences";
import { MAX_LABEL_TARGETS } from "../label-limits";
import { MAX_SUSPENSION_TARGETS } from "../validation";
import { useStudentLabels } from "../use-labels";
import { ArchiveDialog, type ArchiveRequest } from "./archive-dialog";
import { SuspensionDialog, type SuspensionRequest } from "./suspension-dialog";
import { StudentCodeDialog, type CodeTarget } from "../../codes/components/dialog";
import { fetchStudentCodes, studentCodeQueryKeys } from "../../codes/queries";
import { useStudentCodeSettings } from "../../codes/use-settings";
import { StudentEditSheet } from "./edit-sheet";
import { useViewAsStudent } from "@/modules/development";
import { GroupChangeDialog } from "./group-dialog";
import { AddStudentMenu } from "./add-menu";
import { BulkBar } from "./table/bulk-bar";
import { BulkLabels } from "./table/bulk-labels";
import { buildColumns } from "./table/columns";
import { ColumnsPopover } from "./table/columns-popover";
import { StudentsDataTable } from "./table/data-table";
import type { RowActions } from "./table/row-menu";
import { StudentsPagination } from "./table/pagination";
import { StudentsToolbar } from "./table/toolbar";

const NO_ROWS: StudentRecordRow[] = [];
const NO_CODES: Record<string, string> = {};

export function StudentsPage() {
  // The gate re-mounts the content per academy, which resets selection, the sheet, and dialogs.
  return (
    <AcademyGate>
      {(academy) => (
        <Suspense fallback={<PageSkeleton />}>
          <StudentsContent academy={academy} />
        </Suspense>
      )}
    </AcademyGate>
  );
}

const apply = <T,>(updater: Updater<T>, current: T): T =>
  typeof updater === "function" ? (updater as (old: T) => T)(current) : updater;

function StudentsContent({ academy }: { academy: AcademyEntry }) {
  const href = useCanonicalHref();
  const academyId = academy.id;
  const { user } = useAuth();
  const canManage = canArchiveStudentRecords(academy.role);
  const canSelect = canApplyStudentLabels(academy.role);
  const labelManager = canManageLabels(academy.role);
  const { preferences, hydrated, update: updatePreferences } = useTablePreferences(user?.id, academyId);
  const [params, updateParams] = useListParams(preferences.pageSize ?? DEFAULT_PAGE_SIZE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const linkedRecord = searchParams.get("record");
  useEffect(() => {
    if (linkedRecord && z.guid().safeParse(linkedRecord).success) setEditingId(linkedRecord);
  }, [linkedRecord]);
  const [archiveRequest, setArchiveRequest] = useState<ArchiveRequest | null>(null);
  const [groupChange, setGroupChange] = useState<RecordVersion[] | null>(null);
  const [suspensionRequest, setSuspensionRequest] = useState<SuspensionRequest | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  // `?groups=open` (the Groups command) opens the groups panel.
  const openGroups = searchParams.get("groups") === "open";
  useEffect(() => {
    if (openGroups) setGroupsOpen(true);
  }, [openGroups]);

  const listQuery = useQuery({
    queryKey: studentListQueryKey(academyId, params),
    queryFn: ({ signal }) => fetchStudentList(academyId, params, signal),
    placeholderData: keepPreviousData,
    // Wait for stored preferences so the first request already uses the saved page size.
    enabled: hydrated,
  });
  const structureQuery = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId) });
  const groupsQuery = useQuery({ queryKey: groupListQueryKey(academyId, false), queryFn: () => loadGroups(academyId) });
  const list = listQuery.data;
  const rows = list?.rows ?? NO_ROWS;
  const catalogQuery = useLabels(academyId, "students");
  const catalog = catalogQuery.data;
  const labelWrites = useStudentLabels(academyId);
  const { applyToRecord } = labelWrites;
  const [managingLabels, setManagingLabels] = useState<{ open: boolean; opener: HTMLElement | null }>({ open: false, opener: null });
  const openLabelManager = useCallback((opener: HTMLElement | null) => setManagingLabels({ open: true, opener }), []);

  // Selection survives paging and sorting, and clears whenever identity, year, search, status, or filters change.
  const [selection, setSelection] = useState<Selection>({});
  const scope = selectionScope(params, user?.id, list?.academicYearId);
  const [currentScope, setCurrentScope] = useState(scope);
  if (currentScope !== scope) {
    setCurrentScope(scope);
    setSelection({});
    setSuspensionRequest(null);
  }
  // Keep selected rows' versions current as pages reload, so bulk actions target what is shown.
  const [syncedRows, setSyncedRows] = useState(rows);
  if (syncedRows !== rows) {
    setSyncedRows(rows);
    setSelection((current) => syncSelection(current, rows));
  }

  // Archiving can empty the last page; move back to the last page that still has results.
  useEffect(() => {
    if (!list || listQuery.isPlaceholderData || list.rows.length > 0 || list.total === 0) return;
    const last = clampPageIndex(params.pageIndex, list.total, params.pageSize);
    if (last !== params.pageIndex) updateParams((current) => ({ ...current, pageIndex: last }));
  }, [list, listQuery.isPlaceholderData, params.pageIndex, params.pageSize, updateParams]);

  const onSearch = useCallback((search: string) => updateParams((current) => ({ ...current, search, pageIndex: 0 })), [updateParams]);
  const onFiltersChange = useCallback((change: Partial<StudentListParams>) =>
    updateParams((current) => ({ ...current, ...change, pageIndex: 0 })), [updateParams]);
  const onSortsChange = useCallback((sorts: SortDescriptor[]) =>
    updateParams((current) => ({ ...current, sorts, pageIndex: 0 })), [updateParams]);
  const onPageSizeChange = (pageSize: PageSize) => {
    updatePreferences((current) => ({ ...current, pageSize }));
    updateParams((current) => ({ ...current, pageSize, pageIndex: 0 }));
  };

  const isSelected = useCallback((id: string) => Boolean(selection[id]), [selection]);
  const pageSelection = pageSelectionState(selection, rows);
  const codesEnabled = useStudentCodeSettings(academyId).data?.enabled ?? false;
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const codesQuery = useQuery({
    queryKey: [...studentCodeQueryKeys.listCodes(academyId), rowIds],
    queryFn: ({ signal }) => fetchStudentCodes(academyId, rowIds, signal),
    enabled: codesEnabled && rowIds.length > 0,
    placeholderData: keepPreviousData,
  });
  const codes = codesQuery.data ?? NO_CODES;
  const [codeTarget, setCodeTarget] = useState<CodeTarget | null>(null);
  const viewAsStudent = useViewAsStudent();
  const rowActions = useMemo<RowActions>(() => ({
    academyId,
    canManage,
    onApplyLabel: (row, labelId, applied) => void applyToRecord(row.id, labelId, applied),
    onManageLabels: labelManager ? openLabelManager : undefined,
    onOpen: (row) => setEditingId(row.id),
    onArchive: (row, archive) => setArchiveRequest({ archive, records: [{ id: row.id, version: row.version }], name: row.fullName }),
    onSuspension: (row, suspend) => setSuspensionRequest({ suspend, recordIds: [row.id], name: row.fullName }),
    onCode: codesEnabled ? (row) => setCodeTarget({ id: row.id, fullName: row.fullName, levelId: row.levelId }) : undefined,
    viewAsStudent: (row) => viewAsStudent(row.id),
  }), [academyId, applyToRecord, canManage, codesEnabled, labelManager, openLabelManager, viewAsStudent]);
  const columns = useMemo(() => buildColumns({
    ...rowActions,
    canSelect,
    catalog,
    catalogFailed: catalogQuery.isError,
    isSelected,
    pageSelection,
    onToggleRow: (row, selected) => setSelection((current) => toggleRow(current, row, selected)),
    onTogglePage: (selected) => setSelection((current) => togglePage(current, rows, selected)),
    codes,
  }), [canSelect, catalog, catalogQuery.isError, codes, isSelected, pageSelection, rowActions, rows]);
  const rowHref = useCallback(
    (row: StudentRecordRow) => href(`/app/students/${row.id}?from=${encodeURIComponent(searchParams.toString())}`),
    [href, searchParams],
  );

  const columnOrder = useMemo(
    () => [...(canSelect ? [SELECT_COLUMN] : []), ...preferences.order, ACTIONS_COLUMN],
    [canSelect, preferences.order],
  );
  // TanStack Table returns non-memoizable functions; the body is memoized on rows and layout instead.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    // Search, filters, sorting, and paging run in the database over the whole year.
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    rowCount: list?.total ?? 0,
    enableColumnResizing: true,
    state: {
      columnOrder,
      // The code column does not exist while the academy has student codes off.
      columnVisibility: { ...preferences.visibility, [CODE_COLUMN]: codesEnabled && preferences.visibility[CODE_COLUMN] } as VisibilityState,
      columnSizing: preferences.sizing as ColumnSizingState,
      sorting: params.sorts,
      pagination: { pageIndex: params.pageIndex, pageSize: params.pageSize },
    },
    onColumnSizingChange: (updater) => updatePreferences((current) => ({
      ...current, sizing: apply(updater, current.sizing as ColumnSizingState) as TablePreferences["sizing"],
    })),
    onColumnVisibilityChange: (updater) => updatePreferences((current) => ({
      ...current, visibility: apply(updater, current.visibility as VisibilityState) as TablePreferences["visibility"],
    })),
  });

  const archivable = bulkTargets(selection, true);
  const restorable = bulkTargets(selection, false);
  const selectedCount = Object.keys(selection).length;
  const suspendable = Object.values(selection).filter((entry) => !entry.suspended).length;
  const layout = { order: preferences.order, visibility: preferences.visibility, sizing: preferences.sizing };
  const customized = JSON.stringify(layout) !== JSON.stringify(defaultLayout());
  const filtering = isFiltering(params);
  const noYear = list && !list.academicYearId;
  // Nothing in the year at all, active or archived: one call to action replaces the table.
  const noStudents = Boolean(list?.academicYearId) && list?.yearTotal === 0;

  function deselect(ids: string[]) {
    setSelection((current) => {
      const next = { ...current };
      for (const id of ids) delete next[id];
      return next;
    });
  }

  /** Applies or removes one label on the explicit selection; a failed write keeps the selection. */
  async function applyBulkLabel(label: Label, applied: boolean) {
    const ids = Object.keys(selection);
    if (ids.length > MAX_LABEL_TARGETS) {
      toast.error(`Select at most ${MAX_LABEL_TARGETS} students.`);
      return;
    }
    if (!await labelWrites.applyToSelection(ids, label.id, applied)) return;
    deselect(ids);
    toast.success(`${applied ? "Applied" : "Removed"} “${label.name}” ${applied ? "to" : "from"} ${ids.length} ${ids.length === 1 ? "student" : "students"}`);
    // The selection bar is gone; continue from the table.
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-label="Select all students on this page"]')?.focus());
  }

  /** Takes fresh versions for changed records and drops ones that no longer exist. */
  function onReloadSelection(rows: GroupChangeRow[]) {
    const next: Selection = { ...selection };
    for (const row of rows) {
      if (row.version === null) delete next[row.id];
      else if (next[row.id]) next[row.id] = { ...next[row.id], version: row.version, archived: row.archived };
    }
    setSelection(next);
    setGroupChange(Object.entries(next).map(([id, value]) => ({ id, version: value.version })));
  }

  return (
    <div className="relative flex flex-1">
      <main className="page-shell min-w-0">
        <HeaderActions>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle className="size-9 p-0" aria-label="Groups" pressed={groupsOpen} onPressedChange={setGroupsOpen}>
                <SidebarIcon side="right" open={groupsOpen} />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Groups</TooltipContent>
          </Tooltip>
        </HeaderActions>

        <StudentsToolbar
          params={params}
          onSearch={onSearch}
          codesEnabled={codesEnabled}
          onFiltersChange={onFiltersChange}
          levels={structureQuery.data?.levels ?? []}
          levelNames={structureQuery.data?.levelNames ?? {}}
          tracks={structureQuery.data?.tracks ?? []}
          groups={groupsQuery.data?.groups ?? []}
          labels={catalog}
          actions={<AddStudentMenu academyId={academyId} canImport={canImportStudents(academy.role)} />}
        >
          <ColumnsPopover
            order={codesEnabled ? preferences.order : preferences.order.filter((id) => id !== CODE_COLUMN)}
            visibility={preferences.visibility}
            customized={customized}
            onOrderChange={(order) => updatePreferences((current) => ({
              ...current,
              // While codes are off the column is hidden from the popover; keep its saved position.
              order: codesEnabled ? order : withColumnAt(order, CODE_COLUMN, current.order.indexOf(CODE_COLUMN)),
            }))}
            onVisibilityChange={(id, visible) => updatePreferences((current) => ({ ...current, visibility: { ...current.visibility, [id]: visible } }))}
            onReset={() => updatePreferences((current) => ({ ...defaultLayout(), pageSize: current.pageSize }))}
          />
          {labelManager && (
            <LabelManager academyId={academyId} domain="students" open={managingLabels.open} opener={managingLabels.opener}
              // Opening from the toolbar anchors there; closing keeps the opener so focus can return to it.
              onOpenChange={(open) => setManagingLabels((current) => open ? { open, opener: null } : { ...current, open: false })}
              {...labelWrites.definitionChanges} />
          )}
        </StudentsToolbar>

        {listQuery.isError && (
          <Alert variant="destructive">
            <HugeiconsIcon icon={AlertCircleIcon} />
            <AlertTitle>{list ? "Couldn’t refresh students" : "Couldn’t load students"}</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              {list ? "Showing the last loaded results." : "Check your connection and try again."}
              <Button variant="outline" size="sm" onClick={() => void listQuery.refetch()} disabled={listQuery.isFetching}>
                {listQuery.isFetching ? "Retrying…" : "Retry"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {catalogQuery.isError && !catalog && (
          <Alert variant="destructive">
            <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} />
            <AlertTitle>Couldn’t load labels</AlertTitle>
            <AlertDescription>
              <Button variant="outline" size="sm" onClick={() => void catalogQuery.refetch()} disabled={catalogQuery.isFetching}>
                {catalogQuery.isFetching ? "Retrying…" : "Retry"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {noYear ? (
          <Alert>
            <HugeiconsIcon icon={AlertCircleIcon} />
            <AlertTitle>No active academic year</AlertTitle>
            <AlertDescription>Student records belong to an academic year. Open one for this academy to start adding students.</AlertDescription>
          </Alert>
        ) : noStudents ? (
          <Empty className="min-h-64 rounded-xl border border-dashed border-border bg-card/20 py-20">
            <EmptyHeader className="gap-1">
              <EmptyMedia variant="icon"><HugeiconsIcon icon={UserGroupIcon} aria-hidden="true" /></EmptyMedia>
              <EmptyTitle className="text-xl font-semibold">No students yet</EmptyTitle>
              <EmptyDescription className="leading-[1.4em]">Add students to this academic year to start tracking their placement.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent><Button size="sm" asChild><Link href={href("/app/students/new")} ><HugeiconsIcon icon={Add01Icon} />Add student</Link></Button></EmptyContent>
          </Empty>
        ) : (
          <>
          {!listQuery.isError || list ? (
            <StudentsDataTable
              table={table}
              sorts={params.sorts}
              onSortsChange={onSortsChange}
              loading={!list}
              fetching={listQuery.isFetching && Boolean(list)}
              skeletonRows={Math.min(params.pageSize, 10)}
              isSelected={isSelected}
              rowActions={rowActions}
              rowHref={rowHref}
              empty={filtering ? (
                <Empty className="min-h-48 rounded-lg border py-14">
                  <EmptyHeader className="gap-1">
                    <EmptyMedia variant="icon"><HugeiconsIcon icon={SearchRemoveIcon} aria-hidden="true" /></EmptyMedia>
                    <EmptyTitle>No matching students</EmptyTitle>
                    <EmptyDescription>Try a different search, or clear the search and filters to see every active student.</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button size="sm" variant="outline" onClick={() => onFiltersChange({
                      search: "", status: "active", levelId: null, track: null, group: null, participationType: null, labels: [], unlabeled: false, access: null,
                    })}>{params.search.trim() ? "Clear search and filters" : "Clear filters"}</Button>
                  </EmptyContent>
                </Empty>
              ) : (
                <Empty className="min-h-48 rounded-lg border py-14">
                  <EmptyHeader className="gap-1">
                    <EmptyMedia variant="icon"><HugeiconsIcon icon={Archive02Icon} aria-hidden="true" /></EmptyMedia>
                    <EmptyTitle>No active students</EmptyTitle>
                    <EmptyDescription>Every student in this academic year is archived.</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button size="sm" variant="outline" onClick={() => onFiltersChange({ status: "archived" })}>Show archived</Button>
                  </EmptyContent>
                </Empty>
              )}
            />
          ) : null}

          {list && list.total > 0 && (
            <StudentsPagination
              pageIndex={params.pageIndex}
              pageSize={params.pageSize}
              total={list.total}
              onPageChange={(pageIndex) => updateParams((current) => ({ ...current, pageIndex }))}
              onPageSizeChange={onPageSizeChange}
            />
          )}

          {canSelect && selectedCount > 0 && (
            <BulkBar
              selected={selectedCount}
              labels={<BulkLabels academyId={academyId} pending={labelWrites.bulkPending} onApply={(label, applied) => void applyBulkLabel(label, applied)} onManage={labelManager ? openLabelManager : undefined} />}
              manager={canManage ? {
                archivable: archivable.length,
                restorable: restorable.length,
                onArchive: () => setArchiveRequest({ archive: true, records: archivable }),
                onRestore: () => setArchiveRequest({ archive: false, records: restorable }),
                onChangeGroup: () => setGroupChange(Object.entries(selection).map(([id, value]) => ({ id, version: value.version }))),
                suspendable,
                unsuspendable: selectedCount - suspendable,
                onSuspension: (suspend) => {
                  const ids = Object.keys(selection);
                  if (ids.length > MAX_SUSPENSION_TARGETS) toast.error(`Select at most ${MAX_SUSPENSION_TARGETS} students.`);
                  else setSuspensionRequest({ suspend, recordIds: ids });
                },
              } : undefined}
              onClear={() => setSelection({})}
            />
          )}
          </>
        )}

        <StudentCodeDialog academy={academy} target={codeTarget} onClose={() => setCodeTarget(null)} />
        <StudentEditSheet academy={academy} recordId={editingId} onClose={() => setEditingId(null)} />
        {canChangeStudentGroups(academy.role) && (
          <GroupChangeDialog
            academyId={academyId}
            academicYearId={list?.academicYearId ?? null}
            records={groupChange}
            groups={groupsQuery.data?.groups ?? []}
            onClose={() => setGroupChange(null)}
            onDone={deselect}
            onReloadSelection={onReloadSelection}
          />
        )}
        {canManage && (
          <SuspensionDialog
            academyId={academyId}
            request={suspensionRequest}
            onClose={() => setSuspensionRequest(null)}
            onDone={(request) => {
              // A row action (named) leaves the selection alone; a bulk action clears what it changed.
              if (request.name) return;
              deselect(request.recordIds);
              requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-label="Select all students on this page"]')?.focus());
            }}
          />
        )}
        <ArchiveDialog
          academyId={academyId}
          academicYearId={list?.academicYearId ?? null}
          request={archiveRequest}
          onClose={() => setArchiveRequest(null)}
          onDone={deselect}
        />
      </main>
      {groupsOpen && (
        <OverlayPanel aria-label="Groups">
          <GroupsBoard
            academy={academy}
            compact
            title={<h2 className="font-semibold">Groups</h2>}
            selectedId={params.group}
            // Clicking the shown group again clears the filter; a group outside the level or track filter replaces them.
            onOpen={(group) => onFiltersChange(params.group === group.id ? { group: null } : {
              group: group.id,
              ...(params.levelId && params.levelId !== group.level_id ? { levelId: null, track: null } : {}),
              ...(params.track && params.track !== (group.track_id ?? NONE) ? { track: null } : {}),
            })}
          />
        </OverlayPanel>
      )}
    </div>
  );
}

function PageSkeleton() {
  return (
    <main role="status" aria-label="Loading students" className="page-shell">
      <Skeleton className="h-9 w-full max-w-sm" />
      <Skeleton className="h-96 w-full rounded-lg" />
    </main>
  );
}
