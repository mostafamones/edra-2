"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconBooks, IconCheck, IconEdit, IconLoader2, IconRefresh, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { AcademyGate, useAuth, useAcademyScope } from "@/modules/auth";
import { attendanceRootKey } from "@/modules/attendance";
import { useCanonicalHref } from "@/modules/navigation";
import { newUuid } from "@/lib/uuid";
import { unwrapContent } from "../types";
import { loadTaught, loadTaughtOptions, saveTaught } from "./actions";
import { LOCK_LABELS, selection, sameSelection, taughtQueryKey, type TaughtItem, type TaughtSheet } from "./types";

export function ContentTaughtSection({ sessionId }: { sessionId: string }) {
  const { user } = useAuth();
  return <AcademyGate>{academy => user && <TaughtContent key={`${user.id}:${academy.id}:${sessionId}`} userId={user.id} academyId={academy.id} sessionId={sessionId} />}</AcademyGate>;
}

function TaughtContent({ userId, academyId, sessionId }: { userId: string; academyId: string; sessionId: string }) {
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: taughtQueryKey(userId, academyId, sessionId), queryFn: async () => unwrapContent(await loadTaught({ academyId, sessionId })), refetchInterval: 30_000, refetchOnWindowFocus: true, retry: false });
  const href = useCanonicalHref();
  return <section aria-labelledby="taught-content-heading"><Card>
    <CardHeader className="items-center"><CardTitle id="taught-content-heading" className="flex items-center gap-2"><IconBooks className="size-5" />Taught units</CardTitle>
      <CardAction>{query.data && !query.data.lockReason && <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={query.isError}><IconEdit />Edit units</Button>}</CardAction>
    </CardHeader>
    <CardContent className="space-y-4">
      {query.isPending && <Skeleton className="h-16" aria-label="Loading taught units" />}
      {query.isError && <Alert variant="destructive"><AlertTitle>Couldn’t load taught units</AlertTitle><AlertDescription>{query.error.message}<Button variant="outline" size="sm" onClick={() => query.refetch()}>Retry</Button></AlertDescription></Alert>}
      {query.data && <>
        {query.data.lockReason && <Badge variant="secondary">{LOCK_LABELS[query.data.lockReason]}</Badge>}
        {query.data.items.length ? <ul className="divide-y">{query.data.items.map(item => <li key={item.unitId} className="flex items-center gap-3 py-2"><Link className="min-w-0 flex-1 break-words underline-offset-4 hover:underline" href={href(`/app/content/${item.unitId}`)}>{item.title}</Link><Badge variant="outline">Version {item.revision}</Badge></li>)}</ul> : <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><IconBooks /></EmptyMedia><EmptyTitle>No taught units recorded</EmptyTitle></EmptyHeader></Empty>}
        {query.data.history.length > 0 && <details className="text-sm"><summary className="cursor-pointer font-medium">Recent changes</summary><ol className="mt-3 space-y-3">{query.data.history.map(event => <li key={event.revision}><p>{event.savedBy || "Staff member"} · {new Date(event.savedAt).toLocaleString()}</p><p className="text-muted-foreground">{event.titles.length ? event.titles.join(" · ") : "All units removed"}</p></li>)}</ol></details>}
      </>}
    </CardContent>
  </Card>{editing && query.data && <EditTaught userId={userId} academyId={academyId} sessionId={sessionId} sheet={query.data} onClose={() => setEditing(false)} />}</section>;
}

function EditTaught({ userId, academyId, sessionId, sheet, onClose }: { userId: string; academyId: string; sessionId: string; sheet: TaughtSheet; onClose: () => void }) {
  const queryClient = useQueryClient(), isCurrent = useAcademyScope();
  const [base, setBase] = useState({ revision: sheet.revision, items: sheet.items });
  const [items, setItems] = useState(sheet.items), [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [discard, setDiscard] = useState(false);
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const options = useQuery({ queryKey: [...taughtQueryKey(userId, academyId, sessionId), "options"], queryFn: async () => unwrapContent(await loadTaughtOptions({ academyId, sessionId })), refetchOnWindowFocus: true, retry: false });
  const dirty = !sameSelection(base.items, items), stale = sheet.revision !== base.revision;
  const locked = sheet.lockReason !== null;
  const available = (options.data ?? []).filter(item => !items.some(selected => selected.unitId === item.unitId) && item.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function close() { if (busy) return; if (dirty) setDiscard(true); else onClose(); }
  function reload() { setBase({ revision: sheet.revision, items: sheet.items }); setItems(sheet.items); setError(""); request.current = null; }
  async function save() {
    if (busy || locked || stale || !dirty) return;
    const payload = { academyId, sessionId, expectedRevision: base.revision, items: selection(items) };
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: newUuid() };
    setBusy(true); setError("");
    try {
      const result = await saveTaught({ ...payload, key: request.current.key });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: taughtQueryKey(userId, academyId, sessionId), exact: true }),
        queryClient.invalidateQueries({ queryKey: attendanceRootKey(academyId) }),
      ]);
      if (!isCurrent(academyId)) return;
      unwrapContent(result); toast.success("Taught units saved."); onClose();
    } catch (e) { if (isCurrent(academyId)) setError(e instanceof Error ? e.message : "Could not save. Try again."); }
    finally { setBusy(false); }
  }
  function add(item: TaughtItem) { if (!busy && !locked && !stale && items.length < 200) setItems(current => [...current, item]); }
  return <><Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
    <DialogHeader><DialogTitle>Edit taught units</DialogTitle></DialogHeader>
    {locked && <Alert><AlertTitle>{LOCK_LABELS[sheet.lockReason!]}</AlertTitle></Alert>}
    {stale && !locked && <Alert><AlertTitle>Taught units changed on another screen</AlertTitle><AlertDescription><Button variant="outline" size="sm" onClick={reload} disabled={busy}>Reload saved units</Button></AlertDescription></Alert>}
    <div className="max-h-[60dvh] space-y-4 overflow-y-auto pr-1">
      <div className="space-y-2"><h3 className="text-sm font-medium">Selected ({items.length})</h3>{items.length ? <ul className="space-y-2">{items.map(item => <li key={item.unitId} className="flex items-center gap-2 rounded-md border px-3 py-2"><span className="min-w-0 flex-1 break-words text-sm">{item.title}</span><Badge variant="outline">v{item.revision}</Badge><Button size="icon" variant="ghost" aria-label={`Remove ${item.title}`} disabled={busy || locked || stale} onClick={() => setItems(current => current.filter(i => i.unitId !== item.unitId))}><IconX /></Button></li>)}</ul> : <p className="text-sm text-muted-foreground">No units selected</p>}</div>
      {!locked && <div className="space-y-2"><div className="flex gap-2"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search published units" aria-label="Search published units" /><Button size="icon" variant="outline" aria-label="Refresh available units" onClick={() => options.refetch()} disabled={options.isFetching}><IconRefresh /></Button></div>
        {options.isPending ? <div role="status" aria-label="Loading available units"><Skeleton className="h-20" /></div> : options.isError ? <Alert variant="destructive"><AlertTitle>Couldn’t load available units</AlertTitle><AlertDescription>{options.error.message}<Button variant="outline" size="sm" onClick={() => options.refetch()}>Retry</Button></AlertDescription></Alert> : available.length ? <ul className="space-y-1">{available.map(item => <li key={item.unitId}><label className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted"><Checkbox checked={false} onCheckedChange={checked => { if (checked) add(item); }} disabled={busy || stale || items.length >= 200} /><span className="min-w-0 flex-1 break-words text-sm">{item.title}</span><Badge variant="outline">v{item.revision}</Badge></label></li>)}</ul> : <Empty className="border"><EmptyHeader><EmptyTitle>{search ? "No matching units" : "No other compatible published units"}</EmptyTitle></EmptyHeader></Empty>}
      </div>}
      {items.length >= 200 && <p role="status" className="text-sm">Maximum 200 units per session.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
    <DialogFooter><Button variant="outline" disabled={busy} onClick={close}>{dirty ? "Cancel" : "Close"}</Button><Button disabled={busy || !dirty || stale || locked} onClick={save}>{busy ? <IconLoader2 className="animate-spin" /> : <IconCheck />}{busy ? "Saving…" : "Save units"}</Button></DialogFooter>
  </DialogContent></Dialog>
  <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent aria-describedby={undefined}><AlertDialogHeader><AlertDialogTitle>Discard unsaved unit changes?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={onClose}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
