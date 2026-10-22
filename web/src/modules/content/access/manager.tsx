"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
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
  if (query.isPending) return <Skeleton className="h-40" />;
  if (query.isError) return <Card><CardContent className="space-y-2 py-4"><p role="alert">{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Retry access</Button></CardContent></Card>;
  const workspace = query.data;
  return <><Card><CardHeader><CardTitle>Student access</CardTitle></CardHeader><CardContent className="space-y-4">
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setSearch(draftSearch.trim()); setRecordPage(0); }}><Input aria-label="Search students" maxLength={100} value={draftSearch} onChange={e => setDraftSearch(e.target.value)} /><Button type="submit" variant="outline">Search</Button><Button type="button" variant="outline" onClick={() => refresh()}>Refresh</Button></form>
    {!workspace.records.length ? <Empty className="border"><EmptyHeader><EmptyTitle>No matching students</EmptyTitle></EmptyHeader></Empty> : <><Table><TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Access</TableHead><TableHead>Expires</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{workspace.records.map(record => {
      const disabled = !workspace.canIssue || !record.connected || record.suspended;
      return <TableRow key={record.id}><TableCell><p className="font-medium">{record.name}</p><p className="text-xs text-muted-foreground">{record.phone}</p></TableCell><TableCell><Badge variant="secondary">{record.suspended ? "Suspended" : !record.connected ? "Not connected" : accessLabels[record.access.status]}</Badge></TableCell><TableCell>{learningDate(record.access.expiresAt)}</TableCell><TableCell><div className="flex flex-wrap gap-1"><Button variant="outline" size="sm" disabled={disabled} onClick={() => setSelection({ kind: "grant", record })}>Grant access</Button><Button variant="outline" size="sm" disabled={disabled || record.access.status === "locked" || record.access.status === "revoked"} onClick={() => setSelection({ kind: "extend", record })}>Extend</Button>{workspace.manager && <Button variant="outline" size="sm" disabled={disabled || !record.access.grantId || record.access.status === "revoked"} onClick={() => setSelection({ kind: "revoke", record })}>Revoke</Button>}<Button variant="ghost" size="sm" onClick={() => setHistory(record)}>History</Button></div></TableCell></TableRow>;
    })}</TableBody></Table><div className="flex justify-between"><Button variant="outline" disabled={recordPage === 0} onClick={() => setRecordPage(p => p - 1)}>Previous</Button><Button variant="outline" disabled={!workspace.recordsHasMore} onClick={() => setRecordPage(p => p + 1)}>Next</Button></div></>}
  </CardContent></Card>
    <UnitCodes academyId={academyId} unitId={unitId} workspace={workspace} page={codePage} onPage={setCodePage} onChanged={refresh} />
    {selection && <GrantDialog key={`${selection.kind}:${selection.record.id}`} academyId={academyId} unitId={unitId} record={selection.record} kind={selection.kind} defaultDays={workspace.defaultDays} revision={workspace.publishedRevision} onClose={() => setSelection(null)} onSaved={refresh} />}
    {history && <AccessHistoryDialog academyId={academyId} unitId={unitId} userId={userId} record={history} onClose={() => setHistory(null)} />}
  </>;
}
