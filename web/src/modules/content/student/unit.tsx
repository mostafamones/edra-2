"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowLeft, IconFile, IconPlayerPlay, IconLock } from "@tabler/icons-react";
import { newUuid } from "@/lib/uuid";
import { studentAcademyPath } from "@/lib/routing";
import { useAuth } from "@/modules/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { extendMyUnitAccess, loadLearningUnit, redeemUnitCode } from "../access/actions";
import { accessLabels, learningDate, normalizeUnitCode, type LearningUnit } from "../access/types";
import { KIND_LABELS, unwrapContent } from "../types";
import { StudentMaterial } from "./material";

export function StudentLearningUnit({ academyId, academySlug, userId, initial }: { academyId: string; academySlug: string; userId: string; initial: LearningUnit }) {
  const cache = useQueryClient();
  const [code, setCode] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [extending, setExtending] = useState(false);
  const codeRequest = useRef<{ code: string; id: string } | null>(null), extensionRequest = useRef<string | null>(null);
  const { user, loading } = useAuth();
  const query = useQuery({ queryKey: ["learning", userId, academyId, "unit", initial.id], enabled: !loading && user?.id === userId, queryFn: async () => {
    const result = unwrapContent(await loadLearningUnit({ academyId, unitId: initial.id }));
    if (result.userId !== userId) throw new Error("Your account changed. Reload this page.");
    return result.unit;
  }, initialData: initial, staleTime: 0, refetchInterval: 60000 });
  const unit = query.data;
  async function refresh() { await cache.invalidateQueries({ queryKey: ["learning", userId, academyId] }); }
  async function redeem() {
    const normalized = normalizeUnitCode(code);
    if (!/^[0-9a-f]{32}$/.test(normalized)) { setError("Enter a valid unit code."); return; }
    if (codeRequest.current?.code !== normalized) codeRequest.current = { code: normalized, id: newUuid() };
    setBusy(true); setError(""); setNotice("");
    try { const result = unwrapContent(await redeemUnitCode({ academyId, unitId: unit.id, code: normalized, requestId: codeRequest.current.id })); setCode(""); codeRequest.current = null; setNotice(`Access granted until ${learningDate(result.expiresAt)}.`); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not redeem this code."); }
    finally { setBusy(false); }
  }
  async function extend() {
    extensionRequest.current ??= newUuid(); setBusy(true); setError(""); setNotice("");
    try { const result = unwrapContent(await extendMyUnitAccess({ academyId, unitId: unit.id, requestId: extensionRequest.current })); extensionRequest.current = null; setExtending(false); setNotice(`Extended until ${learningDate(result.expiresAt)}.`); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not activate the extension."); }
    finally { setBusy(false); }
  }
  if (loading || user?.id !== userId) return <main className="page-shell"><p role="status">{loading ? "Loading…" : "Reload to continue with your current account."}</p>{!loading && <Button onClick={() => window.location.reload()}>Reload</Button>}</main>;
  if (query.isError) return <main className="page-shell"><p role="alert">{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></main>;
  return <main className="page-shell max-w-5xl"><Button asChild variant="ghost" className="self-start"><Link href={studentAcademyPath(academySlug)}><IconArrowLeft />Content units</Link></Button>
    <div className="flex flex-wrap items-center gap-3"><h1 className="font-heading text-2xl font-bold">{unit.title}</h1><Badge variant="secondary">{accessLabels[unit.access.status]}</Badge></div>
    {unit.description && <p className="whitespace-pre-wrap">{unit.description}</p>}
    <Card><CardHeader><CardTitle>Unit access</CardTitle></CardHeader><CardContent className="space-y-4"><dl className="grid grid-cols-2 gap-2 text-sm"><dt>Duration</dt><dd>{unit.accessDays} days</dd><dt>Expires</dt><dd>{learningDate(unit.access.expiresAt)}</dd></dl>
      <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); void redeem(); }}><Field className="min-w-48 flex-1"><FieldLabel htmlFor="unit-redemption-code">Unit code</FieldLabel><Input id="unit-redemption-code" value={code} maxLength={100} disabled={busy} autoComplete="off" onChange={e => setCode(e.target.value)} /></Field><Button type="submit" disabled={busy || !code.trim()}>{busy ? "Working…" : "Redeem code"}</Button></form>
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{unit.extensionAvailable ? "Annual extension available" : "Annual extension used"}</Badge>{unit.access.status === "expired" && unit.extensionAvailable && <AlertDialog open={extending} onOpenChange={open => { if (!busy) setExtending(open); }}><AlertDialogTrigger asChild><Button variant="outline" disabled={busy}>Use 48-hour extension</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Use your annual extension?</AlertDialogTitle><AlertDialogDescription>This grants 48 hours for this unit and uses your one extension for this academy this academic year.</AlertDialogDescription></AlertDialogHeader>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void extend(); }}>Activate extension</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</div>
      {error && !extending && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Learning material</CardTitle></CardHeader><CardContent>{!unit.items.length ? <Empty><EmptyHeader><EmptyTitle>No learning material</EmptyTitle></EmptyHeader></Empty> : <ol className="space-y-3">{unit.items.map(item => <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-md border p-4">{item.kind === "document" ? <IconFile aria-hidden="true" className="size-5" /> : <IconPlayerPlay aria-hidden="true" className="size-5" />}<div className="min-w-0 flex-1"><p className="font-medium">{item.title}</p><Badge variant="outline">{KIND_LABELS[item.kind]}</Badge></div>{item.available && !query.isError ? <StudentMaterial key={`${item.id}:${unit.access.grantId}`} academyId={academyId} unitId={unit.id} itemId={item.id} title={item.title} expiresAt={unit.access.expiresAt} /> : <Badge variant="secondary"><IconLock className="size-3" />{item.kind === "assessment" ? "Unavailable" : "Locked"}</Badge>}</li>)}</ol>}</CardContent></Card>
  </main>;
}
