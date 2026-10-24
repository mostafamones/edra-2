"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, Archive02Icon, ArchiveRestoreIcon, BookOpen01Icon, FloppyDiskIcon, MoreHorizontalIcon, SentIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { AcademyGate } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { changeUnit, loadUnit, saveUnit } from "../actions";
import { refreshVideo } from "../media-actions";
import type { ContentDetail } from "../data";
import { canEditUnit, documentSchema, STATE_LABELS, unwrapContent, type ContentDocument, type ContentItem } from "../types";
import { AddMaterial } from "./add-material";
import { MaterialRow } from "./material";
import { ReuseMaterial } from "./reuse";
import { UploadedFiles } from "./uploads";
import { UnitAccessPanel } from "../access/manager";

export function ContentEditorPage({ unitId }: { unitId: string }) { return <AcademyGate>{academy => <Editor academy={academy} unitId={unitId} />}</AcademyGate>; }
function Editor({ academy, unitId }: { academy: AcademyEntry; unitId: string }) {
  const query = useQuery({ queryKey: ["content", academy.id, "unit", unitId], queryFn: () => loadUnit(academy.id, unitId), refetchOnWindowFocus: false });
  useBreadcrumbTitle(query.data?.unit.draft.title ?? "Unit");
  if (query.isPending) return <main role="status" aria-label="Loading unit" className="page-shell"><Skeleton className="h-16 w-80" /><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"><Skeleton className="h-96 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div></main>;
  if (query.isError) return <main className="page-shell"><Alert variant="destructive"><HugeiconsIcon icon={AlertCircleIcon} /><AlertTitle>Couldn’t load unit</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{query.error.message}<Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? "Retrying…" : "Retry"}</Button></AlertDescription></Alert></main>;
  return <UnitEditor key={`${unitId}:${query.data.unit.version}`} academy={academy} data={query.data} />;
}
function UnitEditor({ academy, data }: { academy: AcademyEntry; data: ContentDetail }) {
  const cache = useQueryClient();
  const { unit, program } = data;
  const [document, setDocument] = useState<ContentDocument>(unit.draft);
  const [assets, setAssets] = useState(data.assets);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState("");
  const [archiving, setArchiving] = useState(false);
  const closed = !!program.academic_years.closed_at;
  const editable = canEditUnit(unit, data.userId, data.manager) && !closed;
  const disabled = busy || uploading || !editable;
  const dirty = JSON.stringify(document) !== JSON.stringify(unit.draft);
  const canManage = data.manager && !closed;
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
  async function refreshAssets() { setAssets((await loadUnit(academy.id, unit.id)).assets); }
  async function perform(action: string) {
    setBusy(true); setError("");
    try {
      if (action === "save") { const parsed = documentSchema.safeParse(document); if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the fields."); unwrapContent(await saveUnit({ academyId: academy.id, unitId: unit.id, version: unit.version, document: parsed.data })); }
      else {
        if (dirty) throw new Error("Save your edits before this action.");
        unwrapContent(await changeUnit({ academyId: academy.id, unitId: unit.id, version: unit.version, action, feedback }));
      }
      toast.success("Changes saved."); await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not complete the action."); }
    finally { setBusy(false); }
  }
  const add = (item: ContentItem) => setDocument(current => item.assetId && current.items.some(existing => existing.assetId === item.assetId && existing.kind === item.kind && existing.assessmentId === item.assessmentId && existing.assessmentKind === item.assessmentKind) ? current : ({ ...current, items: [...current.items, item] }));
  function move(index: number, delta: number) { setDocument(current => { const items = [...current.items]; const to = index + delta; if (to < 0 || to >= items.length) return current; [items[index], items[to]] = [items[to], items[index]]; return { ...current, items }; }); }
  async function uploaded(item: ContentItem) {
    add(item);
    try { await refreshAssets(); } catch { setError("Upload finished. Refresh processing status if it does not appear yet."); }
  }
  const setItems = (items: ContentItem[]) => setDocument({ ...document, items });
  return <main className="page-shell min-w-0">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={unit.state === "published" ? "default" : "secondary"}>{STATE_LABELS[unit.state]}</Badge>
          {unit.review_requested_at && unit.state !== "review" && <Badge variant="outline">In review</Badge>}
          {unit.state === "published" && unit.version !== unit.published_version && <Badge variant="outline">Unpublished changes</Badge>}
          {dirty && <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">Unsaved</Badge>}
        </div>
        <h1 dir="auto" className="text-2xl font-bold tracking-tight break-words">{unit.draft.title}</h1>
        <p className="text-sm text-muted-foreground">{data.programLabel} · {program.academic_years.start_year}–{program.academic_years.start_year + 1}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {editable && <Button variant={canManage && unit.state !== "archived" ? "outline" : "default"} disabled={disabled || !dirty || !document.title.trim()} onClick={() => perform("save")}><HugeiconsIcon icon={FloppyDiskIcon} aria-hidden="true" />{busy ? "Saving…" : "Save draft"}</Button>}
        {editable && <Button variant="outline" disabled={disabled || dirty} onClick={() => perform("submit")}><HugeiconsIcon icon={SentIcon} aria-hidden="true" />Submit for review</Button>}
        {canManage && unit.state !== "archived" && <Button disabled={disabled || dirty} onClick={() => perform("publish")}><HugeiconsIcon icon={Tick02Icon} aria-hidden="true" />{unit.published_revision ? "Publish changes" : "Publish unit"}</Button>}
        {canManage && (unit.state === "archived"
          ? <Button variant="outline" disabled={busy} onClick={() => perform("restore")}><HugeiconsIcon icon={ArchiveRestoreIcon} aria-hidden="true" />Restore as draft</Button>
          : <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More actions" disabled={busy || uploading}><HugeiconsIcon icon={MoreHorizontalIcon} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-fit"><DropdownMenuItem variant="destructive" disabled={dirty} onSelect={() => setArchiving(true)}><HugeiconsIcon icon={Archive02Icon} />Archive unit</DropdownMenuItem></DropdownMenuContent></DropdownMenu>)}
      </div>
    </div>
    {closed && <Alert><HugeiconsIcon icon={AlertCircleIcon} /><AlertTitle>This academic year is closed. The unit is read-only.</AlertTitle></Alert>}
    {error && <Alert variant="destructive" role="alert"><HugeiconsIcon icon={AlertCircleIcon} /><AlertTitle>Couldn’t complete the action</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="material-title" className="min-w-0 space-y-3">
        <div className="flex min-h-9 items-center justify-between gap-2">
          <h2 id="material-title" className="text-base font-semibold">Material<span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">{document.items.length}</span></h2>
          {editable && <ReuseMaterial academyId={academy.id} unitId={unit.id} version={unit.version} disabled={disabled || dirty} onChange={reload} />}
        </div>
        {!document.items.length
          ? <Empty className="min-h-48 rounded-xl border border-dashed bg-card/20"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={BookOpen01Icon} aria-hidden="true" /></EmptyMedia><EmptyTitle>No material yet</EmptyTitle></EmptyHeader></Empty>
          : <ol className="divide-y divide-border/60 overflow-hidden rounded-xl border bg-card">{document.items.map((item, index) => <MaterialRow key={item.id} academyId={academy.id} item={item} asset={assets.find(a => a.id === item.assetId)} first={index === 0} last={index === document.items.length - 1} disabled={disabled}
            onTitle={title => setItems(document.items.map(i => i.id === item.id ? { ...i, title } : i))} onMove={delta => move(index, delta)} onRemove={() => setItems(document.items.filter(i => i.id !== item.id))}
            onRefresh={async () => { try { unwrapContent(await refreshVideo(academy.id, item.assetId!)); await refreshAssets(); } catch { setError("Could not refresh processing. Try again."); } }} />)}</ol>}
        {editable && <UploadedFiles academyId={academy.id} unitId={unit.id} assets={assets} items={document.items} disabled={disabled} dirty={dirty} onAdd={add} onRefresh={refreshAssets} />}
        {editable && <AddMaterial academyId={academy.id} unitId={unit.id} version={unit.version} items={document.items} dirty={dirty} disabled={disabled} busy={busy || uploading} onBusy={setUploading} onUploaded={uploaded} onAdd={add} onCreated={reload} />}
      </section>
      <aside className="flex min-w-0 flex-col gap-6">
        <Panel title="Details">
          <FieldGroup className="gap-4 p-4">
            <Field><FieldLabel htmlFor="content-title">Title</FieldLabel><Input id="content-title" dir="auto" maxLength={200} value={document.title} disabled={disabled} onChange={e => setDocument({ ...document, title: e.target.value })} /></Field>
            <Field><FieldLabel htmlFor="content-description">Description</FieldLabel><Textarea id="content-description" dir="auto" className="min-h-24" maxLength={10000} value={document.description} disabled={disabled} onChange={e => setDocument({ ...document, description: e.target.value })} /></Field>
            <Field><FieldLabel htmlFor="content-access-days">Access duration (days)</FieldLabel><Input id="content-access-days" type="number" min={1} max={2147483647} step={1} value={Number.isNaN(document.accessDays) ? "" : document.accessDays} disabled={disabled} onChange={e => setDocument({ ...document, accessDays: e.target.valueAsNumber })} /></Field>
          </FieldGroup>
        </Panel>
        <Panel title="Feedback" count={data.feedback.length}>
          {data.feedback.length > 0 && <ol className="divide-y divide-border/60">{data.feedback.map(f => <li key={f.id} className="px-4 py-3"><p dir="auto" className="whitespace-pre-wrap text-sm">{f.body}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString()}</p></li>)}</ol>}
          {!data.feedback.length && !(data.manager && editable) && <p className="px-4 py-3 text-sm text-muted-foreground">No feedback yet.</p>}
          {data.manager && editable && <div className="space-y-2 border-t border-border/60 p-4 first:border-t-0"><Textarea aria-label="Feedback" dir="auto" value={feedback} maxLength={5000} disabled={busy} onChange={e => setFeedback(e.target.value)} /><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={disabled || dirty || !feedback.trim()} onClick={() => perform("feedback")}>Send feedback</Button><Button size="sm" variant="outline" disabled={disabled || dirty || !feedback.trim()} onClick={() => perform("request_changes")}>Request changes</Button></div></div>}
        </Panel>
        {data.revisions.length > 0 && <Panel title="Publication history" count={data.revisions.length}><ul className="divide-y divide-border/60">{data.revisions.map(r => <li key={r.revision} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span className="font-medium">Version {r.revision}</span><span className="text-xs text-muted-foreground">{new Date(r.published_at).toLocaleString()}</span></li>)}</ul></Panel>}
      </aside>
    </div>
    {unit.published_revision > 0 && <UnitAccessPanel academyId={academy.id} unitId={unit.id} userId={data.userId} />}
    <AlertDialog open={archiving} onOpenChange={setArchiving}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Archive this unit?</AlertDialogTitle><AlertDialogDescription>It leaves active student learning. Material and history are preserved, and restoring returns it as a draft.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => perform("archive")}>Archive unit</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}

function Panel({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return <section className="flex flex-col gap-2">
    <h2 className="px-1 text-base font-semibold">{title}{count !== undefined && <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">{count}</span>}</h2>
    <div className="overflow-hidden rounded-xl border bg-card">{children}</div>
  </section>;
}
