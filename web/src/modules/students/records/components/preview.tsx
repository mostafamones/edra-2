import { useMemo } from "react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import type { Group, Level, Track } from "@/modules/groups";
import type { Label } from "@/modules/labels";
import { DEFAULT_LIST_PARAMS } from "../list-params";
import { ACTIONS_COLUMN, SELECT_COLUMN } from "../table/config";
import { defaultLayout } from "../table/preferences";
import type { StudentRecordRow } from "../types";
import { buildColumns } from "./table/columns";
import { StudentsDataTable } from "./table/data-table";
import { StudentsPagination } from "./table/pagination";
import { StudentsToolbar } from "./table/toolbar";

const none = () => undefined;

/**
 * The Students page's own toolbar, table and pagination over supplied rows, with every action disabled.
 * For display only (the public landing page); it reads and writes nothing.
 */
export function StudentsPreview({ rows, total, catalog, levels, tracks, groups, levelNames }: {
  rows: StudentRecordRow[];
  total: number;
  catalog: Label[];
  levels: Level[];
  tracks: Track[];
  groups: Group[];
  levelNames: Record<string, string>;
}) {
  const layout = defaultLayout();
  // A preview window is narrower than the page; keep the columns that read at a glance.
  const hidden = { code: false, createdAt: false, studentPhone: false, parentPhone: false };
  const actions = useMemo(() => ({ academyId: "preview", canManage: false, onApplyLabel: none, onOpen: none, onArchive: none, onSuspension: none }), []);
  const columns = useMemo(() => buildColumns({
    ...actions, canSelect: true, catalog, catalogFailed: false, isSelected: () => false, pageSelection: false, onToggleRow: none, onTogglePage: none, codes: {},
  }), [actions, catalog]);
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows, columns, getCoreRowModel: getCoreRowModel(), getRowId: row => row.id,
    manualPagination: true, manualSorting: true, manualFiltering: true, rowCount: total,
    state: { columnOrder: [SELECT_COLUMN, ...layout.order, ACTIONS_COLUMN], columnVisibility: { ...layout.visibility, ...hidden } },
  });

  return <>
    <StudentsToolbar params={DEFAULT_LIST_PARAMS} onSearch={none} codesEnabled={false} onFiltersChange={none}
      levels={levels} levelNames={levelNames} tracks={tracks} groups={groups} labels={catalog}
      actions={<Button size="sm"><HugeiconsIcon icon={Add01Icon} strokeWidth={1.5} aria-hidden="true" />Add student</Button>} />
    <StudentsDataTable table={table} sorts={DEFAULT_LIST_PARAMS.sorts} onSortsChange={none} loading={false} fetching={false} skeletonRows={0}
      empty={null} isSelected={() => false} rowActions={actions} rowHref={() => "#"} />
    <StudentsPagination pageIndex={0} pageSize={10} total={total} onPageChange={none} onPageSizeChange={none} disabled />
  </>;
}
