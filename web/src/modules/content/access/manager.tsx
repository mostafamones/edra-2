"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, Calendar03Icon, Cancel01Icon, Clock01Icon, MoreHorizontalIcon, RefreshIcon, Search01Icon, UserAdd01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { unwrapContent } from "../types";
import { loadAccessWorkspace } from "./actions";
import { accessLabels, learningDate, type AccessRecord } from "./types";
import { GrantDialog } from "./grant-dialog";
import { UnitCodes } from "./codes";
import { AccessHistoryDialog } from "./history";

export function UnitAccessPanel({ academyId, unitId, userId }: { academyId: string; unitId: string; userId: string }) {
  const cache = useQueryClient();
  const [search, setSearch] = useState(""), [draftSearch, setDraftSearch] = useState("");
  const [recordPage, setRecordPage] = useState(0), [codePage, setCodePage] = useState(0);
  const [selection, setSelection] = useState<{ kind: "grant" | "extend" | "revoke"; record: AccessRecord } | null>(null);
  const [history, setHistory] = useState<AccessRecord | null>(null);
  const query = useQuery({ queryKey: ["content-access", userId, academyId, unitId, search, recordPage, codePage], queryFn: async () => unwrapContent(await loadAccessWorkspace({ academyId, unitId, search, recordPage, codePage })), refetchOnWindowFocus: true });
  async function refresh() { await Promise.all([cache.invalidateQueries({ queryKey: ["content-access", userId, academyId, unitId] }), cache.invalidateQueries({ queryKey: ["content-access-history", userId, academyId, unitId] }), cache.invalidateQueries({ queryKey: ["learning"] })]); }
  const [tab, setTab] = useState("students");
  if (query.isPending) return <Skeleton role="status" aria-label="Loading access" className="h-56 rounded-xl" />;
  if (query.isError) return <Alert variant="destructive"><HugeiconsIcon icon={AlertCircleIcon} /><AlertTitle>Couldn’t load student access</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{query.error.message}<Button variant="outline" size="sm" onClick={() => query.refetch()}>Retry access</Button></AlertDescription></Alert>;
  const workspace = query.data;
  return <section aria-labelledby="access-title" className="space-y-3">
    <h2 id="access-title" className="px-1 text-base font-semibold">Student access</h2>
    <Tabs value={tab} onValueChange={setTab} className="gap-4">
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <TabsList variant="line" className="min-w-0 flex-1 justify-start border-b">
          <TabsTrigger value="students" className="flex-none">Students</TabsTrigger>
          <TabsTrigger value="codes" className="flex-none">Unit codes</TabsTrigger>
        </TabsList>
        {tab === "students" && <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setSearch(draftSearch.trim()); setRecordPage(0); }}>
          <InputGroup className="sm:w-60"><InputGroupInput type="search" className="[&::-webkit-search-cancel-button]:appearance-none" aria-label="Search students" placeholder="Search students..." maxLength={100} value={draftSearch} onChange={e => setDraftSearch(e.target.value)} /><InputGroupAddon><HugeiconsIcon icon={Search01Icon} /></InputGroupAddon></InputGroup>
          <Button type="button" variant="outline" size="icon" aria-label="Refresh access" disabled={query.isFetching} onClick={() => refresh()}><HugeiconsIcon icon={RefreshIcon} /></Button>
        </form>}
      </div>
      <TabsContent value="students" className="space-y-3">
        {!workspace.records.length ? <Empty className="min-h-48 rounded-xl border border-dashed bg-card/20"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={UserGroupIcon} aria-hidden="true" /></EmptyMedia><EmptyTitle>{search ? "No matching students" : "No students"}</EmptyTitle></EmptyHeader>{search && <EmptyContent><Button variant="outline" size="sm" onClick={() => { setSearch(""); setDraftSearch(""); setRecordPage(0); }}>Clear search</Button></EmptyContent>}</Empty>
          : <><div className="overflow-hidden rounded-xl border bg-card"><Table><TableHeader><TableRow><TableHead className="pl-4">Student</TableHead><TableHead>Access</TableHead><TableHead>Expires</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{workspace.records.map(record => {
            const disabled = !workspace.canIssue || !record.connected || record.suspended;
            const status = record.suspended ? "Suspended" : !record.connected ? "Not connected" : accessLabels[record.access.status];
            return <TableRow key={record.id}><TableCell className="pl-4"><p dir="auto" className="font-medium">{record.name}</p><p dir="ltr" className="text-xs text-muted-foreground tabular-nums">{record.phone}</p></TableCell><TableCell><Badge variant={record.access.status === "active" && !disabled ? "default" : "secondary"}>{status}</Badge></TableCell><TableCell className="text-muted-foreground">{learningDate(record.access.expiresAt)}</TableCell><TableCell className="pr-3 text-right">
              <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Access actions for ${record.name}`}><HugeiconsIcon icon={MoreHorizontalIcon} /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-fit">
                  <DropdownMenuItem disabled={disabled} onSelect={() => setSelection({ kind: "grant", record })}><HugeiconsIcon icon={UserAdd01Icon} />Grant access</DropdownMenuItem>
                  <DropdownMenuItem disabled={disabled || record.access.status === "locked" || record.access.status === "revoked"} onSelect={() => setSelection({ kind: "extend", record })}><HugeiconsIcon icon={Calendar03Icon} />Extend</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setHistory(record)}><HugeiconsIcon icon={Clock01Icon} />History</DropdownMenuItem>
                  {workspace.manager && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" disabled={disabled || !record.access.grantId || record.access.status === "revoked"} onSelect={() => setSelection({ kind: "revoke", record })}><HugeiconsIcon icon={Cancel01Icon} />Revoke</DropdownMenuItem></>}
                </DropdownMenuContent></DropdownMenu>
            </TableCell></TableRow>;
          })}</TableBody></Table></div>
          {(recordPage > 0 || workspace.recordsHasMore) && <div className="flex justify-end gap-2"><Button variant="outline" size="sm" disabled={recordPage === 0} onClick={() => setRecordPage(p => p - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={!workspace.recordsHasMore} onClick={() => setRecordPage(p => p + 1)}>Next</Button></div>}</>}
      </TabsContent>
      <TabsContent value="codes"><UnitCodes academyId={academyId} unitId={unitId} workspace={workspace} page={codePage} onPage={setCodePage} onChanged={refresh} /></TabsContent>
    </Tabs>
    {selection && <GrantDialog key={`${selection.kind}:${selection.record.id}`} academyId={academyId} unitId={unitId} record={selection.record} kind={selection.kind} defaultDays={workspace.defaultDays} revision={workspace.publishedRevision} onClose={() => setSelection(null)} onSaved={refresh} />}
    {history && <AccessHistoryDialog academyId={academyId} unitId={unitId} userId={userId} record={history} onClose={() => setHistory(null)} />}
  </section>;
}
