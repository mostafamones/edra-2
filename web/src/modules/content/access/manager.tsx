"use client";
import { useEffect, useState } from "react";
import { keepPreviousData, queryOptions, useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, ArrowLeft01Icon, ArrowLeftDoubleIcon, ArrowRight01Icon, SearchRemoveIcon, Calendar03Icon, Cancel01Icon, Clock01Icon, MoreHorizontalIcon, RefreshIcon, Search01Icon, UserAdd01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { unwrapContent } from "../types";
import { loadAccessWorkspace } from "./actions";
import { accessLabels, learningDate, type AccessRecord } from "./types";
import { GrantDialog } from "./grant-dialog";
import { AccessHistoryDialog } from "./history";

/** Shared with the editor's background prefetch of the first page. */
export function accessOptions(academyId: string, unitId: string, userId: string, search = "", recordPage = 0) {
  return queryOptions({ queryKey: ["content-access", userId, academyId, unitId, search, recordPage], staleTime: 30_000, queryFn: async () => unwrapContent(await loadAccessWorkspace({ academyId, unitId, search, recordPage })) });
}

function accessKeys(userId: string, academyId: string, unitId: string) { return [["content-access", userId, academyId, unitId], ["content-access-history", userId, academyId, unitId], ["learning"]]; }

/** The access search and refresh, shown in the unit editor's tab row while the Students tab is open. */
export function AccessSearch({ academyId, unitId, userId, draft, onDraft, onSearch }: { academyId: string; unitId: string; userId: string; draft: string; onDraft: (draft: string) => void; onSearch: (search: string) => void }) {
  const cache = useQueryClient();
  // Searches as you type, once typing pauses.
  useEffect(() => { const timer = setTimeout(() => onSearch(draft.trim()), 300); return () => clearTimeout(timer); }, [draft, onSearch]);
  const fetching = useIsFetching({ queryKey: ["content-access", userId, academyId, unitId] }) > 0;
  return <form className="flex gap-2" onSubmit={e => { e.preventDefault(); onSearch(draft.trim()); }}>
    <Tooltip><TooltipTrigger asChild><Button type="button" variant="outline" size="icon" aria-label="Refresh access" disabled={fetching} onClick={() => accessKeys(userId, academyId, unitId).forEach(queryKey => void cache.invalidateQueries({ queryKey }))}><HugeiconsIcon icon={RefreshIcon} strokeWidth={1.5} /></Button></TooltipTrigger><TooltipContent>Refresh</TooltipContent></Tooltip>
    <InputGroup className="sm:w-60"><InputGroupInput type="search" className="[&::-webkit-search-cancel-button]:appearance-none" aria-label="Search students" placeholder="Search students..." maxLength={100} value={draft} onChange={e => onDraft(e.target.value)} /><InputGroupAddon><HugeiconsIcon icon={Search01Icon} strokeWidth={1.5} /></InputGroupAddon></InputGroup>
  </form>;
}

export function UnitAccessPanel({ academyId, unitId, userId, search, onClearSearch }: { academyId: string; unitId: string; userId: string; search: string; onClearSearch: () => void }) {
  const cache = useQueryClient();
  // A new search starts back on the first page.
  const [paging, setPaging] = useState({ search, page: 0 });
  const recordPage = paging.search === search ? paging.page : 0;
  const setRecordPage = (page: number) => setPaging({ search, page });
  const [selection, setSelection] = useState<{ kind: "grant" | "extend" | "revoke"; record: AccessRecord } | null>(null);
  const [history, setHistory] = useState<AccessRecord | null>(null);
  const query = useQuery({ ...accessOptions(academyId, unitId, userId, search, recordPage), refetchOnWindowFocus: true, placeholderData: keepPreviousData });
  async function refresh() { await Promise.all(accessKeys(userId, academyId, unitId).map(queryKey => cache.invalidateQueries({ queryKey }))); }
  if (query.isPending) return <Skeleton role="status" aria-label="Loading access" className="h-56 rounded-xl" />;
  if (query.isError) return <Alert variant="destructive"><HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} /><AlertTitle>Couldn’t load student access</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{query.error.message}<Button variant="outline" size="sm" onClick={() => query.refetch()}>Retry access</Button></AlertDescription></Alert>;
  const workspace = query.data;
  return <section aria-label="Student access" className="space-y-3">
        {!workspace.records.length ? (search ? <Empty className="min-h-48 rounded-lg border py-14"><EmptyHeader className="gap-1"><EmptyMedia variant="icon"><HugeiconsIcon icon={SearchRemoveIcon} strokeWidth={1.5} aria-hidden="true" /></EmptyMedia><EmptyTitle>No matching students</EmptyTitle><EmptyDescription>Try a different search.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" size="sm" onClick={onClearSearch}>Clear search</Button></EmptyContent></Empty>
          : <Empty className="min-h-48 rounded-lg border py-14"><EmptyHeader className="gap-1"><EmptyMedia variant="icon"><HugeiconsIcon icon={UserGroupIcon} strokeWidth={1.5} aria-hidden="true" /></EmptyMedia><EmptyTitle>No students</EmptyTitle></EmptyHeader></Empty>)
          : <><div className={query.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={query.isPlaceholderData}><Table><TableHeader><TableRow><TableHead className="pl-4">Student</TableHead><TableHead>Access</TableHead><TableHead>Expires</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{workspace.records.map(record => {
            const disabled = !workspace.canIssue || !record.connected || record.suspended;
            const status = record.suspended ? "Suspended" : !record.connected ? "Not connected" : accessLabels[record.access.status];
            return <TableRow key={record.id}><TableCell className="pl-4"><p dir="auto" className="font-medium">{record.name}</p><p dir="ltr" className="text-xs text-muted-foreground tabular-nums">{record.phone}</p></TableCell><TableCell><Badge variant={record.access.status === "active" && !disabled ? "default" : "secondary"}>{status}</Badge></TableCell><TableCell className="text-muted-foreground">{learningDate(record.access.expiresAt)}</TableCell><TableCell className="pr-3 text-right">
              <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Access actions for ${record.name}`}><HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.5} /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-fit">
                  <DropdownMenuItem disabled={disabled} onSelect={() => setSelection({ kind: "grant", record })}><HugeiconsIcon icon={UserAdd01Icon} strokeWidth={1.5} />Grant access</DropdownMenuItem>
                  <DropdownMenuItem disabled={disabled || record.access.status === "locked" || record.access.status === "revoked"} onSelect={() => setSelection({ kind: "extend", record })}><HugeiconsIcon icon={Calendar03Icon} strokeWidth={1.5} />Extend</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setHistory(record)}><HugeiconsIcon icon={Clock01Icon} strokeWidth={1.5} />History</DropdownMenuItem>
                  {workspace.manager && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" disabled={disabled || !record.access.grantId || record.access.status === "revoked"} onSelect={() => setSelection({ kind: "revoke", record })}><HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} />Revoke</DropdownMenuItem></>}
                </DropdownMenuContent></DropdownMenu>
            </TableCell></TableRow>;
          })}</TableBody></Table></div>
          {(recordPage > 0 || workspace.recordsHasMore) && <nav aria-label="Student pages" className="flex items-center justify-end gap-4 px-2 text-sm">
            <span className="tabular-nums text-muted-foreground">Page {recordPage + 1}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" aria-label="First page" disabled={recordPage === 0 || query.isPlaceholderData} onClick={() => setRecordPage(0)}><HugeiconsIcon icon={ArrowLeftDoubleIcon} strokeWidth={1.5} /></Button>
              <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={recordPage === 0 || query.isPlaceholderData} onClick={() => setRecordPage(recordPage - 1)}><HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.5} /></Button>
              <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={!workspace.recordsHasMore || query.isPlaceholderData} onClick={() => setRecordPage(recordPage + 1)}><HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} /></Button>
            </div>
          </nav>}</>}
    {selection && <GrantDialog key={`${selection.kind}:${selection.record.id}`} academyId={academyId} unitId={unitId} record={selection.record} kind={selection.kind} defaultDays={workspace.defaultDays} revision={workspace.publishedRevision} onClose={() => setSelection(null)} onSaved={refresh} />}
    {history && <AccessHistoryDialog academyId={academyId} unitId={unitId} userId={userId} record={history} onClose={() => setHistory(null)} />}
  </section>;
}
