"use client";

import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { IconAlertCircle, IconSearch, IconSearchOff, IconUsers } from "@tabler/icons-react";

import { FilterPopover, type FilterField } from "@/components/shared/filter-popover";
import { SortPopover } from "@/components/shared/sort-popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAttemptKey } from "@/lib/attempt-key";
import { useStudentCodeSettings } from "@/modules/students/codes/use-settings";
import { StudentsPagination } from "./pagination";

const PAGE_SIZE = 10;

export type StudentRow = { recordId: string; fullName: string; studentCode: string | null; groupName: string | null; archived: boolean };

/** A filter on the list: its options, and whether a row matches the chosen one. */
export type FilterSpec<R> = {
  id: string;
  label: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  match: (row: R, value: string) => boolean;
};

export type SortSpec<R> = { defaultValue: string; options: { value: string; label: string }[]; compare: Record<string, (a: R, b: R) => number> };

export type StudentColumn<R> = { id: string; head: ReactNode; className?: string; cell: (row: R) => ReactNode };

/** The result of announcing selected students, as the list shows it. */
export type AnnounceOutcome =
  | { ok: false; message: string }
  | { ok: true; outcome: "rejected"; failures: { recordId: string; reason: string }[] }
  | { ok: true; outcome: "done"; message: string };

export type AnnounceSpec<R> = {
  /** Why a student was refused, by the server's reason. */
  reasons: Record<string, string>;
  announceable: (row: R) => boolean;
  /** What else the request depends on, so a changed basis never reuses an earlier request's key. */
  basis?: unknown;
  version: (row: R) => number;
  run: (items: { recordId: string; expectedVersion: number }[], key: string) => Promise<AnnounceOutcome>;
};

type Props<R extends StudentRow> = {
  /** The Code column shows only while the academy issues student codes. */
  academyId: string;
  query: { isPending: boolean; isError: boolean; isFetching: boolean; refetch: () => unknown };
  rows: R[] | undefined;
  filters: (rows: R[]) => FilterSpec<R>[];
  sort?: SortSpec<R>;
  /** Narrows the list from outside (such as a chart bar); changing `scope.key` returns to the first page. */
  scope?: { key: unknown; match: (row: R) => boolean; chip: ReactNode };
  /** Controls beside the filters. */
  toolbar?: ReactNode;
  /** Small badges after a student's name. */
  badges?: (row: R) => ReactNode;
  columns: StudentColumn<R>[];
  /** The row's buttons, such as Mark. */
  actions?: (row: R) => ReactNode;
  /** Announcing is offered when this is set. */
  announce?: AnnounceSpec<R>;
  /** Why the list is empty, for the empty state. */
  emptyText: string;
  /** What the empty result says when something narrows the list, instead of the default. */
  noMatchText?: string;
  /** Clears what the scope hides, beyond the built-in search and filters. */
  onClear?: () => void;
};

/**
 * The students tab every assessment shares: search, filters, sorting, paging and announcing selected
 * results. Types supply the columns, the statuses to filter by and how announcing is run.
 */
export function StudentsTable<R extends StudentRow>(props: Props<R>) {
  const { academyId, query, rows: all, filters, sort, scope, toolbar, badges, columns, actions, announce, emptyText, noMatchText, onClear } = props;
  const attempt = useAttemptKey();
  const showCodes = useStudentCodeSettings(academyId).data?.enabled ?? false;
  const [search, setSearch] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [order, setOrder] = useState(sort?.defaultValue ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [announcing, setAnnouncing] = useState(false);
  const [rejection, setRejection] = useState<{ name: string; reason: string }[] | null>(null);
  const [page, setPage] = useState(0);
  const [pagedKey, setPagedKey] = useState("");

  const specs = useMemo(() => filters(all ?? []), [filters, all]);
  const term = search.trim().toLowerCase();
  const valueOf = (spec: FilterSpec<R>) => values[spec.id] ?? spec.defaultValue;
  const rows = useMemo(() => {
    const matching = (all ?? []).filter((row) => specs.every((spec) => valueOf(spec) === spec.defaultValue || spec.match(row, valueOf(spec)))
      && (!scope || scope.match(row))
      && (!term || row.fullName.toLowerCase().includes(term) || (row.studentCode ?? "").toLowerCase().includes(term)));
    const compare = sort && order !== sort.defaultValue ? sort.compare[order] : undefined;
    return compare ? matching.sort(compare) : matching;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, specs, values, term, scope, sort, order]);

  // Any change to the search, filters, sort or scope returns to the first page.
  const filterKey = JSON.stringify([term, values, order, scope?.key]);
  if (pagedKey !== filterKey) { setPagedKey(filterKey); setPage(0); }
  const pageIndex = Math.min(page, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
  const pageRows = rows.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);

  if (query.isPending) {
    return <div role="status" aria-label="Loading students" className="flex flex-col gap-2">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-10 rounded-lg" />)}</div>;
  }
  if (query.isError || !all) {
    return (
      <Alert variant="destructive">
        <IconAlertCircle />
        <AlertTitle>Couldn’t load the students</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          Check your connection and try again.
          <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>Retry</Button>
        </AlertDescription>
      </Alert>
    );
  }

  const chosen = announce ? all.filter((row) => selected.has(row.recordId) && announce.announceable(row)) : [];
  const visibleAnnounceable = announce ? rows.filter(announce.announceable) : [];
  const allVisibleChosen = visibleAnnounceable.length > 0 && visibleAnnounceable.every((row) => selected.has(row.recordId));
  const filtering = term !== "" || specs.some((spec) => valueOf(spec) !== spec.defaultValue) || scope !== undefined;
  const fields: FilterField[] = specs.map((spec) => ({
    id: spec.id, label: spec.label, value: valueOf(spec), defaultValue: spec.defaultValue, options: spec.options,
    onChange: (value) => setValues((current) => ({ ...current, [spec.id]: value })),
  }));

  function toggle(recordId: string, on: boolean) {
    setSelected((current) => { const next = new Set(current); if (on) next.add(recordId); else next.delete(recordId); return next; });
  }

  async function runAnnounce() {
    if (!announce || chosen.length === 0 || announcing) return;
    const items = chosen.map((row) => ({ recordId: row.recordId, expectedVersion: announce.version(row) }));
    setAnnouncing(true);
    setRejection(null);
    try {
      const result = await announce.run(items, attempt.keyFor(JSON.stringify([announce.basis ?? null, items])));
      if (!result.ok) { toast.error(result.message); return; }
      if (result.outcome === "rejected") {
        const names = new Map(all!.map((row) => [row.recordId, row.fullName]));
        setRejection(result.failures.map((entry) => ({ name: names.get(entry.recordId) ?? "A student", reason: entry.reason })));
        return;
      }
      attempt.reset();
      setSelected(new Set());
      if (result.message) toast.success(result.message);
    } catch {
      toast.error("We couldn’t confirm whether this was announced. Press Announce again: retrying uses the same request, so it can’t be applied twice.");
    } finally {
      setAnnouncing(false);
    }
  }

  function clearAll() {
    setSearch("");
    setValues({});
    onClear?.();
  }

  const empty = all.length === 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="w-full sm:min-w-0 sm:max-w-lg sm:flex-1">
          <InputGroupInput type="search" placeholder="Search students" aria-label="Search students" value={search} onChange={(event) => setSearch(event.target.value)} />
          <InputGroupAddon><IconSearch /></InputGroupAddon>
        </InputGroup>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {toolbar}
          <FilterPopover iconOnly fields={fields} />
          {sort && <SortPopover value={order} defaultValue={sort.defaultValue} options={sort.options} onChange={setOrder} />}
          {announce && (
            <Button className="shrink-0" disabled={chosen.length === 0 || announcing} onClick={() => void runAnnounce()}>
              {announcing ? "Announcing…" : chosen.length ? `Announce ${chosen.length} result${chosen.length === 1 ? "" : "s"}` : "Announce results"}
            </Button>
          )}
        </div>
      </div>

      {!empty && scope && <div className="flex flex-col items-start gap-2">{scope.chip}</div>}

      {rejection && announce && (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>Nothing was announced</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">{rejection.map((entry, index) => <li key={index}>{entry.name} {announce.reasons[entry.reason] ?? "can’t be announced"}.</li>)}</ul>
            Fix these students or deselect them, then announce again.
          </AlertDescription>
        </Alert>
      )}

      {empty ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconUsers aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No students</EmptyTitle>
            <EmptyDescription>{emptyText}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : rows.length === 0 ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconSearchOff aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No matching students</EmptyTitle>
            <EmptyDescription>{filtering ? (noMatchText ?? "No student matches this search and filter.") : showCodes ? "Try a different name or code." : "Try a different name."}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button size="sm" variant="outline" onClick={clearAll}>Clear search and filters</Button></EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {announce && (
                  <TableHead className="w-10">
                    <Checkbox aria-label="Select every student shown whose result can be announced" checked={allVisibleChosen} disabled={visibleAnnounceable.length === 0}
                      onCheckedChange={(on) => setSelected((current) => {
                        const next = new Set(current);
                        for (const row of visibleAnnounceable) { if (on === true) next.add(row.recordId); else next.delete(row.recordId); }
                        return next;
                      })} />
                  </TableHead>
                )}
                {showCodes && <TableHead className="w-28">Code</TableHead>}
                <TableHead>Student</TableHead>
                {columns.map((column) => <TableHead key={column.id} className={column.className}>{column.head}</TableHead>)}
                {actions && <TableHead className="w-32"><span className="sr-only">Actions</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow key={row.recordId}>
                  {announce && (
                    <TableCell>
                      <Checkbox aria-label={`Select ${row.fullName}`} checked={selected.has(row.recordId)} disabled={!announce.announceable(row)}
                        onCheckedChange={(on) => toggle(row.recordId, on === true)} />
                    </TableCell>
                  )}
                  {showCodes && <TableCell className="font-mono text-muted-foreground">{row.studentCode ?? "—"}</TableCell>}
                  <TableCell>
                    <span className="font-medium">{row.fullName}</span>
                    {badges?.(row)}
                    {row.archived && <Badge variant="secondary" className="ml-2">Archived record</Badge>}
                    {row.groupName && <span className="block text-xs text-muted-foreground">{row.groupName}</span>}
                  </TableCell>
                  {columns.map((column) => <TableCell key={column.id} className={column.className}>{column.cell(row)}</TableCell>)}
                  {actions && <TableCell className="text-right whitespace-nowrap">{actions(row)}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {rows.length > PAGE_SIZE && <StudentsPagination pageIndex={pageIndex} pageSize={PAGE_SIZE} total={rows.length} onPageChange={setPage} />}
    </div>
  );
}
