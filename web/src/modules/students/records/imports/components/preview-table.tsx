"use client";

import { useState, type ReactNode } from "react";
import { IconSearch, IconSearchOff, IconTrash } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { StudentsPagination } from "../../components/table/pagination";
import type { PageSize } from "../../list-params";
import type { ImportRow } from "../types";
import { ImportRowsTable } from "./rows-table";

export function ImportPreviewTable({ rows, onRemove, disabled, actions }: { rows: ImportRow[]; onRemove: (ordinals: number[]) => void; disabled: boolean; actions?: ReactNode }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set<number>());
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<PageSize>(20);
  const term = search.trim().toLocaleLowerCase();
  const matches = rows.filter((row) => !term || String(row.sourceRow) === term || Object.values(row.source).some((cell) => typeof cell === "string" && cell.toLocaleLowerCase().includes(term)));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(matches.length / size) - 1));
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:max-w-sm">
          <InputGroupInput type="search" placeholder="Search entries" aria-label="Search entries" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
          <InputGroupAddon><IconSearch /></InputGroupAddon>
        </InputGroup>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {selected.size > 0 && <>
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Button variant="destructive" size="sm" disabled={disabled} onClick={() => { onRemove([...selected]); setSelected(new Set()); }}><IconTrash />Delete entries</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          </>}
          {actions}
        </div>
      </div>
      {matches.length === 0 ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border bg-card/20 py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconSearchOff aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>{term ? "No matching entries" : "No entries"}</EmptyTitle>
            <EmptyDescription>{term ? "Try a different search, or clear it to see every entry." : "Every entry has been removed."}</EmptyDescription>
          </EmptyHeader>
          {term && <EmptyContent><Button size="sm" variant="outline" onClick={() => setSearch("")}>Clear search</Button></EmptyContent>}
        </Empty>
      ) : (
        <ImportRowsTable rows={matches.slice(currentPage * size, (currentPage + 1) * size)} loading={false} fetching={false} mode="preview" rowWord="row" selected={selected} onSelectionChange={setSelected} disabled={disabled} />
      )}
      {matches.length > 0 && <StudentsPagination pageIndex={currentPage} pageSize={size} total={matches.length} onPageChange={setPage} onPageSizeChange={(value) => { setSize(value); setPage(0); }} />}
    </div>
  );
}
