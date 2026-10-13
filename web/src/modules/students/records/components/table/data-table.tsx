"use client";

import { memo, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { flexRender, type Column, type Row, type Table as TanstackTable } from "@tanstack/react-table";
import { cn } from "cn";

import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SortDescriptor } from "../../list-params";
import type { StudentRecordRow } from "../../types";
import { COLUMN_LABELS, COLUMN_WIDTHS, isDataColumn, RESIZE_STEP } from "../../table/config";
import { clampTrade, fitWidths } from "../../table/layout";
import { HeaderMenu } from "./header-menu";

type Props = {
  table: TanstackTable<StudentRecordRow>;
  sorts: SortDescriptor[];
  onSortsChange: (sorts: SortDescriptor[]) => void;
  /** No rows have loaded yet: show placeholder rows. */
  loading: boolean;
  /** Rows are shown while newer results load. */
  fetching: boolean;
  skeletonRows: number;
  /** Rendered instead of the whole table (headers and scroll container included) when a loaded page has no rows. */
  empty: ReactNode;
  isSelected: (id: string) => boolean;
};

/**
 * The student table. It always fills its container exactly: selection and actions keep their width and
 * the data columns share the rest in proportion to their TanStack sizes, rendered through a <colgroup>
 * with fixed table layout. Resizing moves the boundary between a column and its right neighbour, so no
 * other column moves. It commits on release; while dragging only the handle and guide move.
 */
export function StudentsDataTable({ empty, ...props }: Props) {
  if (!props.loading && props.table.getRowModel().rows.length === 0) return empty;
  return <PopulatedTable {...props} />;
}

/** Owns the container measurement so the observer attaches whenever the table mounts after an empty state. */
function PopulatedTable({ table, sorts, onSortsChange, loading, fetching, skeletonRows, isSelected }: Omit<Props, "empty">) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [available, setAvailable] = useState(0);
  const [guideHeight, setGuideHeight] = useState(0);
  const columns = table.getVisibleLeafColumns();
  const rows = table.getRowModel().rows;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setAvailable(container.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const { widths, scale } = fitWidths(
    columns.map((column) => ({ size: column.getSize(), fixed: !isDataColumn(column.id) })),
    available,
  );

  return (
    <div ref={containerRef} className="min-w-0 overflow-hidden rounded-lg border">
      <Table
        ref={tableRef}
        aria-busy={loading || fetching || undefined}
        className="table-fixed"
        style={available ? { width: available } : undefined}
      >
        <colgroup>
          {columns.map((column, index) => (
            <col key={column.id} style={available ? { width: widths[index] } : undefined} />
          ))}
        </colgroup>
        <TableHeader className="bg-muted/40">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header, index) => {
                const next = group.headers[index + 1]?.column;
                return (
                <TableHead
                  key={header.id}
                  aria-sort={ariaSort(header.column.id, sorts)}
                  className="relative overflow-visible pl-2"
                >
                  <div className="flex min-w-0 items-center">
                    {isDataColumn(header.column.id) ? (
                      <HeaderMenu
                        columnId={header.column.id}
                        label={COLUMN_LABELS[header.column.id]}
                        sorts={sorts}
                        onSortsChange={onSortsChange}
                        canHide={header.column.getCanHide()}
                        onHide={() => header.column.toggleVisibility(false)}
                        resized={header.column.getSize() !== COLUMN_WIDTHS[header.column.id].size}
                        onResetWidth={() => header.column.resetSize()}
                      />
                    ) : flexRender(header.column.columnDef.header, header.getContext())}
                  </div>
                  {available > 0 && header.column.getCanResize() && next?.getCanResize() && (
                    <ResizeHandle
                      column={header.column}
                      next={next}
                      table={table}
                      width={widths[index]}
                      scale={scale}
                      guideHeight={guideHeight}
                      onResizeStart={() => setGuideHeight(tableRef.current?.offsetHeight ?? 0)}
                    />
                  )}
                </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        {loading ? (
          <TableBody>
            {Array.from({ length: skeletonRows }, (_, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                {columns.map((column) => (
                  <TableCell key={column.id} className={cn("h-11", isDataColumn(column.id) ? "pl-4" : "pl-2")}><Skeleton className="h-4 w-3/4" /></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        ) : (
          <Body
            rows={rows}
            fetching={fetching}
            isSelected={isSelected}
            layoutKey={columns.map((column) => column.id).join(",")}
            columnDefs={table.options.columns}
          />
        )}
      </Table>
    </div>
  );
}

type BodyProps = {
  rows: Row<StudentRecordRow>[];
  fetching: boolean;
  isSelected: (id: string) => boolean;
  /** Visible column ids in order; re-renders the body when columns are shown, hidden, or moved. */
  layoutKey: string;
  /** Column definitions; new definitions (for example a changed selection) re-render the body. */
  columnDefs: unknown;
};

/** Rows re-render only for new data or a changed column layout, never while a width is being dragged. */
const Body = memo(function Body({ rows, fetching, isSelected }: BodyProps) {
  return (
    <TableBody className={cn("transition-opacity", fetching && "opacity-60")}>
      {rows.map((row) => (
        <TableRow key={row.id} data-state={isSelected(row.id) ? "selected" : undefined}>
          {row.getVisibleCells().map((cell) => (
            <TableCell key={cell.id} className={cn("h-11 min-w-0 overflow-hidden", isDataColumn(cell.column.id) ? "pl-4" : "pl-2", cell.column.id === "name" && "text-left")}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}, (previous, next) =>
  previous.rows === next.rows
  && previous.fetching === next.fetching
  && previous.isSelected === next.isSelected
  && previous.layoutKey === next.layoutKey
  && previous.columnDefs === next.columnDefs);

function ariaSort(columnId: string, sorts: SortDescriptor[]) {
  const sort = sorts.find((item) => item.id === columnId);
  if (!sort) return undefined;
  return sort.desc ? "descending" : "ascending";
}

type HandleProps = {
  column: Column<StudentRecordRow, unknown>;
  /** The column to the right, which gives or takes the width. */
  next: Column<StudentRecordRow, unknown>;
  table: TanstackTable<StudentRecordRow>;
  /** Rendered width in pixels. */
  width: number;
  /** Rendered pixels per unit of column size. */
  scale: number;
  guideHeight: number;
  onResizeStart: () => void;
};

const sized = (column: Column<StudentRecordRow, unknown>) => {
  const size = column.getSize();
  return { size, minSize: column.columnDef.minSize ?? size, maxSize: column.columnDef.maxSize ?? size };
};

/**
 * Drag, double-click, or keyboard handle on a header's right edge. It moves the boundary with the next
 * column, within both columns' limits. During a drag a guide line spans the table where the boundary
 * will land.
 */
function ResizeHandle({ column, next, table, width, scale, guideHeight, onResizeStart }: HandleProps) {
  const [drag, setDrag] = useState<{ startX: number; delta: number } | null>(null);
  const current = sized(column);
  const neighbour = sized(next);
  const label = isDataColumn(column.id) ? COLUMN_LABELS[column.id] : column.id;
  /** Clamped size change for a boundary move of `pixels`. */
  const trade = (pixels: number) => (scale > 0 ? clampTrade(current, neighbour, pixels / scale) : 0);
  const offset = drag ? Math.round(trade(drag.delta) * scale) : 0;

  function commit(delta: number) {
    if (delta === 0) return;
    table.setColumnSizing((sizing) => ({
      ...sizing,
      [column.id]: Math.round(current.size + delta),
      [next.id]: Math.round(neighbour.size - delta),
    }));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onResizeStart();
    setDrag({ startX: event.clientX, delta: 0 });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (drag) setDrag({ ...drag, delta: event.clientX - drag.startX });
  }

  function onPointerUp() {
    if (!drag) return;
    commit(trade(drag.delta));
    setDrag(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = (event.shiftKey ? RESIZE_STEP * 5 : RESIZE_STEP) * scale;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => commit(trade(-step)),
      ArrowRight: () => commit(trade(step)),
      Home: () => commit(trade(-Infinity)),
      End: () => commit(trade(Infinity)),
      Enter: () => column.resetSize(),
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      aria-valuenow={width}
      aria-valuetext={`${width} pixels`}
      title="Drag to resize · double-click to reset"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => { event.stopPropagation(); column.resetSize(); }}
      onKeyDown={onKeyDown}
      className="group/resize absolute top-0 right-0 z-10 flex h-full w-3 cursor-col-resize touch-none justify-center outline-none select-none"
      style={{ transform: `translateX(calc(50% + ${offset}px))` }}
    >
      <div
        aria-hidden="true"
        className={cn(
          "w-px transition-colors group-hover/resize:w-0.5 group-hover/resize:bg-primary/70 group-focus-visible/resize:w-0.5 group-focus-visible/resize:bg-primary",
          drag ? "w-0.5 bg-primary" : "h-full bg-border",
        )}
        style={drag ? { height: guideHeight } : undefined}
      />
    </div>
  );
}
