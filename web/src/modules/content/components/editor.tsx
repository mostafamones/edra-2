"use client";
import { newUuid } from "@/lib/uuid";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowLeft, IconArrowUp, IconArrowDown, IconTrash, IconDeviceFloppy, IconSend, IconArchive, IconRestore, IconCheck, IconRefresh } from "@tabler/icons-react";
import { AcademyGate } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { useCanonicalHref } from "@/modules/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { changeUnit, loadUnit, saveUnit } from "../actions";
import { refreshVideo } from "../media-actions";
import type { ContentDetail } from "../data";
import { canEditUnit, documentSchema, KIND_LABELS, STATE_LABELS, unwrapContent, type ContentDocument, type ContentItem } from "../types";
import { MaterialUploader } from "./uploader";
import { MaterialPreview } from "./preview";
import { AssessmentPicker } from "./assessment-picker";
import { ReuseMaterial } from "./reuse";
import { UploadedFiles } from "./uploads";
import { UnitAccessPanel } from "../access/manager";

export function ContentEditorPage({ unitId }: { unitId: string }) { return <AcademyGate>{academy => <Editor academy={academy} unitId={unitId} />}</AcademyGate>; }
function Editor({ academy, unitId }: { academy: AcademyEntry; unitId: string }) {
  const query = useQuery({ queryKey: ["content", academy.id, "unit", unitId], queryFn: () => loadUnit(academy.id, unitId), refetchOnWindowFocus: false });
  useBreadcrumbTitle(query.data?.unit.draft.title ?? "Unit");
  if (query.isPending) return <main className="page-shell"><Skeleton className="h-12" /><Skeleton className="h-96" /></main>;
  if (query.isError) return <main className="page-shell"><Alert variant="destructive"><AlertTitle>Couldn’t load unit</AlertTitle><AlertDescription>{query.error.message}</AlertDescription></Alert><Button onClick={() => query.refetch()}>Retry</Button></main>;
  return <UnitEditor key={`${unitId}:${query.data.unit.version}`} academy={academy} data={query.data} />;
}
function UnitEditor({ academy, data }: { academy: AcademyEntry; data: ContentDetail }) {
  const href = useCanonicalHref(), cache = useQueryClient();
  const { unit, program } = data;
  const [document, setDocument] = useState<ContentDocument>(unit.draft);
  const [assets, setAssets] = useState(data.assets);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [materialKind, setMaterialKind] = useState<"explanation" | "document" | "answer">("explanation");
  const [answerFor, setAnswerFor] = useState("");
  const editable = canEditUnit(unit, data.userId, data.manager) && !program.academic_years.closed_at;
  const disabled = busy || uploading || !editable;
  const dirty = JSON.stringify(document) !== JSON.stringify(unit.draft);
  useEffect(() => {
    if (!dirty && !uploading) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", protect); return () => window.removeEventListener("beforeunload", protect);
  }, [dirty, uploading]);
  useEffect(() => {
    if (!assets.some(a => a.kind === "video" && !a.deletion_token && ["uploading", "processing"].includes(a.status))) return;
    let stopped = false;
    const timer = setInterval(async () => {
      for (const asset of assets.filter(a => a.kind === "video" && !a.deletion_token && ["uploading", "processing"].includes(a.status))) {
        try {
          const status = unwrapContent(await refreshVideo(academy.id, asset.id));
          if (!stopped && status !== asset.status) {
            const latest = await loadUnit(academy.id, unit.id);
            if (!stopped) setAssets(latest.assets);
          }
        } catch { /* Keep the last confirmed state; the explicit refresh action reports errors. */ }
      }
    }, 8000);
    return () => { stopped = true; clearInterval(timer); };
  }, [assets, academy.id, unit.id]);
  async function reload() { await cache.invalidateQueries({ queryKey: ["content", academy.id] }); }
  async function perform(action: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      if (action === "save") { const parsed = documentSchema.safeParse(document); if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the fields."); unwrapContent(await saveUnit({ academyId: academy.id, unitId: unit.id, version: unit.version, document: parsed.data })); }
      else {
        if (dirty) throw new Error("Save your edits before this action.");
        unwrapContent(await changeUnit({ academyId: academy.id, unitId: unit.id, version: unit.version, action, feedback }));
      }
      setNotice("Changes saved."); await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not complete the action."); }
    finally { setBusy(false); }
  }
  const add = (item: ContentItem) => setDocument(current => item.assetId && current.items.some(existing => existing.assetId === item.assetId && existing.kind === item.kind && existing.assessmentId === item.assessmentId && existing.assessmentKind === item.assessmentKind) ? current : ({ ...current, items: [...current.items, item] }));
  function move(index: number, delta: number) { setDocument(current => { const items = [...current.items]; const to = index + delta; if (to < 0 || to >= items.length) return current; [items[index], items[to]] = [items[to], items[index]]; return { ...current, items }; }); }
  async function uploaded(assetId: string, name: string) {
    const a = document.items.find(i => i.id === answerFor);
    add({ id: newUuid(), kind: materialKind, title: name, assetId, ...(materialKind === "answer" && a ? { assessmentKind: a.assessmentKind, assessmentId: a.assessmentId } : {}) });
    try { const next = await loadUnit(academy.id, unit.id); setAssets(next.assets); } catch { setError("Upload finished. Refresh processing status if it does not appear yet."); }
  }
  return <main className="page-shell max-w-5xl">
    <Button asChild variant="ghost" className="self-start"><Link href={href("/app/content")}><IconArrowLeft />Content library</Link></Button>
    <div className="flex flex-wrap items-center gap-3"><h1 className="font-heading text-2xl font-bold">{unit.draft.title}</h1><Badge variant="secondary">{STATE_LABELS[unit.state]}</Badge>{unit.review_requested_at && unit.state !== "review" && <Badge variant="outline">In review</Badge>}<span className="text-sm text-muted-foreground">{data.programLabel} · {program.academic_years.start_year}–{program.academic_years.start_year + 1}</span></div>
    {unit.published_revision > 0 && <Alert><AlertTitle>{unit.state === "published" ? "Published version stays visible while you edit" : "Published history is preserved"}</AlertTitle><AlertDescription>Saving does not publish. Managers explicitly publish changes. Student work and previous versions remain preserved.</AlertDescription></Alert>}
    {program.academic_years.closed_at && <Alert><AlertTitle>Closed academic year</AlertTitle><AlertDescription>This unit is read-only.</AlertDescription></Alert>}
    {error && <Alert variant="destructive" role="alert"><AlertTitle>Couldn’t complete the action</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}{notice && <p role="status" className="text-sm">{notice}</p>}
    <div className="flex flex-wrap gap-2">
      {editable && <Button disabled={disabled || !dirty || !document.title.trim()} onClick={() => perform("save")}><IconDeviceFloppy />{busy ? "Saving…" : "Save draft"}</Button>}
      {editable && <Button variant="outline" disabled={disabled || dirty} onClick={() => perform("submit")}><IconSend />Submit for review</Button>}
      {data.manager && !program.academic_years.closed_at && unit.state !== "archived" && <Button disabled={disabled || dirty} onClick={() => perform("publish")}><IconCheck />{unit.published_revision ? "Publish changes" : "Publish unit"}</Button>}
      {data.manager && !program.academic_years.closed_at && (unit.state === "archived" ? <Button variant="outline" disabled={busy} onClick={() => perform("restore")}><IconRestore />Restore as draft</Button> : <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" disabled={busy || uploading || dirty}><IconArchive />Archive</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Archive this unit?</AlertDialogTitle><AlertDialogDescription>It will leave active student learning. Material and academic history stay preserved. Restoring it returns it as a draft.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => perform("archive")}>Archive unit</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>)}
    </div>
    <Card><CardHeader><CardTitle>Unit details</CardTitle></CardHeader><CardContent className="space-y-4"><Field><FieldLabel htmlFor="content-title">Title</FieldLabel><Input id="content-title" maxLength={200} value={document.title} disabled={disabled} onChange={e => setDocument({ ...document, title: e.target.value })} /></Field><Field><FieldLabel htmlFor="content-description">Description (optional)</FieldLabel><Textarea id="content-description" maxLength={10000} value={document.description} disabled={disabled} onChange={e => setDocument({ ...document, description: e.target.value })} /></Field><Field><FieldLabel htmlFor="content-access-days">Access duration (days)</FieldLabel><Input id="content-access-days" type="number" min={1} max={2147483647} step={1} value={Number.isNaN(document.accessDays) ? "" : document.accessDays} disabled={disabled} onChange={e => setDocument({ ...document, accessDays: e.target.valueAsNumber })} /></Field></CardContent></Card>
    <Card><CardHeader><CardTitle>Learning material</CardTitle></CardHeader><CardContent className="space-y-4">
      {!document.items.length ? <Empty><EmptyHeader><EmptyTitle>No material yet</EmptyTitle><EmptyDescription>Add videos, documents and assessments. A ready explanation video is required for publication.</EmptyDescription></EmptyHeader></Empty> : <ol className="space-y-3">{document.items.map((item, index) => { const asset = assets.find(a => a.id === item.assetId); return <li key={item.id} className="rounded-lg border p-4 space-y-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{KIND_LABELS[item.kind]}</Badge>{asset && <Badge variant="secondary">{asset.status}</Badge>}<span className="ml-auto flex gap-1"><Button variant="ghost" size="icon" aria-label="Move material up" disabled={disabled || index === 0} onClick={() => move(index, -1)}><IconArrowUp /></Button><Button variant="ghost" size="icon" aria-label="Move material down" disabled={disabled || index === document.items.length - 1} onClick={() => move(index, 1)}><IconArrowDown /></Button><Button variant="ghost" size="icon" aria-label="Remove material" disabled={disabled} onClick={() => setDocument({ ...document, items: document.items.filter(i => i.id !== item.id) })}><IconTrash /></Button></span></div><Input aria-label="Material title" value={item.title} maxLength={250} disabled={disabled} onChange={e => setDocument({ ...document, items: document.items.map(i => i.id === item.id ? { ...i, title: e.target.value } : i) })} />{item.kind === "assessment" ? <Button asChild variant="outline" size="sm"><Link target="_blank" rel="noopener noreferrer" href={href(`/app/${item.assessmentKind === "quiz" ? "quizzes" : item.assessmentKind === "exam" ? "exams" : "assignments"}/${item.assessmentId}`)}>Open assessment</Link></Button> : asset?.status === "ready" ? <MaterialPreview academyId={academy.id} assetId={asset.id} title={item.title} /> : asset?.kind === "video" ? <Button variant="outline" size="sm" onClick={async () => { try { unwrapContent(await refreshVideo(academy.id, asset.id)); setAssets((await loadUnit(academy.id, unit.id)).assets); } catch { setError("Could not refresh processing. Try again."); } }}><IconRefresh />Refresh processing</Button> : null}</li>; })}</ol>}
      {editable && <UploadedFiles academyId={academy.id} unitId={unit.id} assets={assets} items={document.items} disabled={disabled} dirty={dirty} onAdd={add} onRefresh={async () => setAssets((await loadUnit(academy.id, unit.id)).assets)} />}
      {editable && <div className="space-y-4 rounded-lg border border-dashed p-4"><Field><FieldLabel>Add a file</FieldLabel><Select value={materialKind} disabled={uploading || busy} onValueChange={v => setMaterialKind(v as typeof materialKind)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="explanation">Explanation video</SelectItem><SelectItem value="document">Document</SelectItem><SelectItem value="answer">Assessment answer video</SelectItem></SelectContent></Select></Field>
        {materialKind === "answer" && <Field><FieldLabel>Assessment this video explains</FieldLabel><Select value={answerFor} onValueChange={setAnswerFor} disabled={uploading || busy}><SelectTrigger className="w-full"><SelectValue placeholder="Choose an attached assessment" /></SelectTrigger><SelectContent>{document.items.filter(i => i.kind === "assessment").map(i => <SelectItem key={i.id} value={i.id}>{i.title}</SelectItem>)}</SelectContent></Select></Field>}
        <MaterialUploader key={materialKind} academyId={academy.id} unitId={unit.id} kind={materialKind === "document" ? "document" : "video"} disabled={disabled || (materialKind === "answer" && !document.items.some(i => i.id === answerFor && i.kind === "assessment"))} onBusy={setUploading} onUploaded={uploaded} />
      </div>}
      {editable && <><AssessmentPicker academyId={academy.id} unitId={unit.id} items={document.items} version={unit.version} dirty={dirty} disabled={disabled} onAdd={add} onCreated={reload} /><ReuseMaterial academyId={academy.id} unitId={unit.id} version={unit.version} disabled={disabled || dirty} onChange={reload} />{dirty && <p className="text-xs text-muted-foreground">Save edits before copying material from another unit.</p>}</>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Manager feedback</CardTitle></CardHeader><CardContent className="space-y-4">{data.feedback.length ? <ol className="space-y-3">{data.feedback.map(f => <li key={f.id} className="rounded-md bg-muted p-3"><p className="whitespace-pre-wrap text-sm">{f.body}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString()}</p></li>)}</ol> : <p className="text-sm text-muted-foreground">No feedback yet.</p>}{data.manager && editable && <><Textarea aria-label="Feedback" value={feedback} maxLength={5000} disabled={busy} onChange={e => setFeedback(e.target.value)} placeholder="Leave feedback or explain the requested changes" /><div className="flex gap-2"><Button variant="outline" disabled={disabled || dirty || !feedback.trim()} onClick={() => perform("feedback")}>Send feedback</Button><Button variant="outline" disabled={disabled || dirty || !feedback.trim()} onClick={() => perform("request_changes")}>Request changes</Button></div></>}</CardContent></Card>
    {unit.published_revision > 0 && <UnitAccessPanel academyId={academy.id} unitId={unit.id} userId={data.userId} />}
    {data.revisions.length > 0 && <Card><CardHeader><CardTitle>Publication history</CardTitle></CardHeader><CardContent><ul className="space-y-2">{data.revisions.map(r => <li key={r.revision} className="text-sm">Version {r.revision} · {new Date(r.published_at).toLocaleString()}</li>)}</ul></CardContent></Card>}
  </main>;
}
