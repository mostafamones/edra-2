"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, File01Icon, PlayIcon, SquareLock01Icon } from "@hugeicons/core-free-icons";
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
import { accessLabels, isValidAccessCode, learningDate, normalizeUnitCode, type LearningUnit } from "../access/types";
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
  const assessmentAccess = unit.access.status === "active" || unit.access.status === "expired";
  async function refresh() { await cache.invalidateQueries({ queryKey: ["learning", userId, academyId] }); }
  async function redeem() {
    const normalized = normalizeUnitCode(code);
    if (!isValidAccessCode(normalized)) { setError("Enter a valid coupon."); return; }
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
  return <main className="page-shell max-w-5xl"><Button asChild variant="ghost" className="self-start"><Link href={studentAcademyPath(academySlug)}><HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.5} />Content units</Link></Button>
    <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">{unit.title}</h1><Badge variant="secondary">{accessLabels[unit.access.status]}</Badge></div>
    {unit.description && <p className="whitespace-pre-wrap">{unit.description}</p>}
    {unit.prerequisites.length > 0 && <Card><CardHeader><CardTitle>Prerequisites</CardTitle></CardHeader><CardContent><ul className="space-y-2">{unit.prerequisites.map(requirement => <li key={`${requirement.unitId}:${requirement.kind}:${requirement.assessmentId}`} className="flex items-center justify-between gap-3"><Link className="underline underline-offset-4" href={studentAcademyPath(academySlug, `units/${requirement.unitId}`)}>{requirement.unitTitle} · {requirement.title}</Link><Badge variant={requirement.submitted ? "default" : "secondary"}>{requirement.submitted ? (requirement.kind === "access" ? "Unlocked" : "Submitted") : "Required"}</Badge></li>)}</ul></CardContent></Card>}
    <Card><CardHeader><CardTitle>Unit access</CardTitle>{unit.couponType && <Badge variant="outline">{unit.couponType}</Badge>}</CardHeader><CardContent className="space-y-4"><dl className="grid grid-cols-2 gap-2 text-sm"><dt>Duration</dt><dd>{unit.accessDays} days</dd><dt>Expires</dt><dd>{learningDate(unit.access.expiresAt)}</dd></dl>
      <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); void redeem(); }}><Field className="min-w-48 flex-1"><FieldLabel htmlFor="unit-redemption-code">Coupon</FieldLabel><Input id="unit-redemption-code" value={code} maxLength={100} disabled={busy || !unit.prerequisitesMet} autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={e => setCode(e.target.value)} /></Field><Button type="submit" disabled={busy || !code.trim() || !unit.prerequisitesMet}>{busy ? "Working…" : "Redeem coupon"}</Button></form>
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{unit.extensionAvailable ? "Annual extension available" : "Annual extension used"}</Badge>{unit.access.status === "expired" && unit.extensionAvailable && <AlertDialog open={extending} onOpenChange={open => { if (!busy) setExtending(open); }}><AlertDialogTrigger asChild><Button variant="outline" disabled={busy || !unit.prerequisitesMet}>Use 48-hour extension</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Use your annual extension?</AlertDialogTitle><AlertDialogDescription>This grants 48 hours for this unit and uses your one extension for this academy this academic year.</AlertDialogDescription></AlertDialogHeader>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void extend(); }}>Activate extension</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</div>
      {error && !extending && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Learning material</CardTitle></CardHeader><CardContent>{!unit.items.length ? <Empty><EmptyHeader><EmptyTitle>No learning material</EmptyTitle></EmptyHeader></Empty> : <ol className="space-y-3">{unit.items.map(item => <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-md border p-4">{item.kind === "document" ? <HugeiconsIcon icon={File01Icon} strokeWidth={1.5} aria-hidden="true" className="size-5" /> : <HugeiconsIcon icon={PlayIcon} strokeWidth={1.5} aria-hidden="true" className="size-5" />}<div className="min-w-0 flex-1"><p className="font-medium">{item.title}</p><Badge variant="outline">{KIND_LABELS[item.kind]}</Badge></div>{item.available && assessmentAccess && item.kind === "assessment" && item.assessmentKind === "assignment" && item.assessmentId ? <Button asChild variant="outline" size="sm"><Link href={studentAcademyPath(academySlug, `assignments/${item.assessmentId}`)}>Open assignment</Link></Button> : item.available && (item.kind !== "assessment" || assessmentAccess) && !query.isError ? <StudentMaterial key={`${item.id}:${unit.access.grantId}`} academyId={academyId} unitId={unit.id} itemId={item.id} title={item.title} expiresAt={item.kind === "answer" ? null : unit.access.expiresAt} /> : <Badge variant="secondary"><HugeiconsIcon icon={SquareLock01Icon} strokeWidth={1.5} className="size-3" />{item.kind === "assessment" && assessmentAccess ? "Unavailable" : "Locked"}</Badge>}</li>)}</ol>}</CardContent></Card>
  </main>;
}
