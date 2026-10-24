"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, Archive02Icon, ArchiveRestoreIcon, BookOpen01Icon, Loading03Icon, MoreHorizontalIcon, SentIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { AcademyGate } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { HeaderActions } from "@/components/shared/header-actions";
import { SettingsGroup } from "@/components/shared/settings-group";
import { SettingsRow } from "@/components/shared/settings-row";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { changeUnit, loadUnit, publishUnitEdits, saveUnit } from "../actions";
import { refreshVideo } from "../media-actions";
import type { ContentDetail } from "../data";
import { canEditUnit, documentSchema, STATE_LABELS, unwrapContent, type ContentDocument, type ContentItem } from "../types";
import { AddMaterial } from "./add-material";
import { MaterialRow } from "./material";
import { ReuseMaterial } from "./reuse";
import { UploadedFiles } from "./uploads";
import { UnitAccessPanel } from "../access/manager";
import { UnitRequirements } from "../requirements/editor";
import { AccessDuration } from "./duration";

export function ContentEditorPage({ unitId }: { unitId: string }) { return <AcademyGate>{academy => <Editor academy={academy} unitId={unitId} />}</AcademyGate>; }
function Editor({ academy, unitId }: { academy: AcademyEntry; unitId: string }) {
  const query = useQuery({ queryKey: ["content", academy.id, "unit", unitId], queryFn: () => loadUnit(academy.id, unitId), refetchOnWindowFocus: false });
  useBreadcrumbTitle(query.data?.unit.draft.title ?? "Unit");
  if (query.isPending) return <main role="status" aria-label="Loading unit" className="page-shell"><div className="mx-auto flex w-full max-w-3xl flex-col gap-8"><Skeleton className="h-14 w-80" /><Skeleton className="h-96 w-full rounded-lg" /></div></main>;
  if (query.isError) return <main className="page-shell"><div className="mx-auto w-full max-w-3xl"><Alert variant="destructive"><HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} /><AlertTitle>Couldn’t load unit</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{query.error.message}<Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? "Retrying…" : "Retry"}</Button></AlertDescription></Alert></div></main>;
  return <UnitEditor key={`${unitId}:${query.data.unit.version}`} academy={academy} data={query.data} />;
}
function UnitEditor({ academy, data }: { academy: AcademyEntry; data: ContentDetail }) {
  const cache = useQueryClient();
  const { unit, program } = data;
  const [document, setDocument] = useState<ContentDocument>(unit.draft);
  const [assets, setAssets] = useState(data.assets);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState("");
  const [archiving, setArchiving] = useState(false), [tab, setTab] = useState("material");
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
      if (action === "save" || (action === "publish" && dirty)) {
        const parsed = documentSchema.safeParse(document);
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the fields.");
        const input = { academyId: academy.id, unitId: unit.id, version: unit.version, document: parsed.data };
        unwrapContent(await (action === "publish" ? publishUnitEdits(input) : saveUnit(input)));
      }
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
  const actions = <>
    {editable && <Button variant="outline" disabled={disabled || dirty} onClick={() => perform("submit")}><HugeiconsIcon icon={SentIcon} strokeWidth={1.5} aria-hidden="true" />Submit for review</Button>}
    {canManage && unit.state !== "archived" && <Button disabled={disabled} onClick={() => perform("publish")}><HugeiconsIcon icon={Tick02Icon} strokeWidth={1.5} aria-hidden="true" />{unit.published_revision ? "Publish changes" : "Publish unit"}</Button>}
    {canManage && (unit.state === "archived"
      ? <Button variant="outline" disabled={busy} onClick={() => perform("restore")}><HugeiconsIcon icon={ArchiveRestoreIcon} strokeWidth={1.5} aria-hidden="true" />Restore as draft</Button>
      : <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More actions" disabled={busy || uploading}><HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.5} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-fit"><DropdownMenuItem variant="destructive" disabled={dirty} onSelect={() => setArchiving(true)}><HugeiconsIcon icon={Archive02Icon} strokeWidth={1.5} />Archive unit</DropdownMenuItem></DropdownMenuContent></DropdownMenu>)}
  </>;
  // Panels stay mounted so in-flight uploads and field state survive switching tabs.
  const panel = "data-[state=inactive]:hidden";
  return <main className="page-shell min-w-0">
    <HeaderActions><div className="flex items-center gap-2">{actions}</div></HeaderActions>
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 dir="auto" className="min-w-0 text-2xl font-bold tracking-tight break-words">{document.title.trim() || unit.draft.title}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={unit.state === "published" ? "default" : "secondary"}>{STATE_LABELS[unit.state]}</Badge>
            {unit.review_requested_at && unit.state !== "review" && <Badge variant="outline">In review</Badge>}
            {unit.state === "published" && unit.version !== unit.published_version && <Badge variant="outline">Unpublished changes</Badge>}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{data.programLabel} · {program.academic_years.start_year}–{program.academic_years.start_year + 1}</p>
      </div>
      {closed && <Alert><HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} /><AlertTitle>This academic year is closed. The unit is read-only.</AlertTitle></Alert>}
      {error && <Alert variant="destructive" role="alert"><HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} /><AlertTitle>Couldn’t complete the action</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <div className="flex items-center gap-3 border-b">
          <TabsList variant="line" className="min-w-0 flex-1 justify-start overflow-x-auto">
            <TabsTrigger value="material" className="flex-none">Material<Count value={document.items.length} /></TabsTrigger>
            <TabsTrigger value="settings" className="flex-none">Settings</TabsTrigger>
            <TabsTrigger value="review" className="flex-none">Review<Count value={data.feedback.length} /></TabsTrigger>
            {unit.published_revision > 0 && <TabsTrigger value="students" className="flex-none">Students</TabsTrigger>}
          </TabsList>
          {tab === "material" && editable && <ReuseMaterial academyId={academy.id} unitId={unit.id} version={unit.version} disabled={disabled || dirty} onChange={reload} />}
        </div>
        <TabsContent value="material" forceMount className={panel}>
          <section aria-label="Material" className="flex flex-col gap-8">
            {document.items.length > 0 && <ol className="divide-y divide-border/60 overflow-hidden rounded-lg bg-card">{document.items.map((item, index) => <MaterialRow key={item.id} academyId={academy.id} item={item} asset={assets.find(a => a.id === item.assetId)} first={index === 0} last={index === document.items.length - 1} disabled={disabled}
              onTitle={title => setItems(document.items.map(i => i.id === item.id ? { ...i, title } : i))} onMove={delta => move(index, delta)} onRemove={() => setItems(document.items.filter(i => i.id !== item.id))}
              onRefresh={async () => { try { unwrapContent(await refreshVideo(academy.id, item.assetId!)); await refreshAssets(); } catch { setError("Could not refresh processing. Try again."); } }} />)}</ol>}
            {!document.items.length && !editable && <Empty className="min-h-56 rounded-lg border border-dashed bg-card/20"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={BookOpen01Icon} strokeWidth={1.5} aria-hidden="true" /></EmptyMedia><EmptyTitle>No material yet</EmptyTitle></EmptyHeader></Empty>}
            {editable && <AddMaterial academyId={academy.id} unitId={unit.id} version={unit.version} items={document.items} dirty={dirty} disabled={disabled} busy={busy || uploading} onBusy={setUploading} onUploaded={uploaded} onAdd={add} onCreated={reload} />}
            {editable && <UploadedFiles academyId={academy.id} unitId={unit.id} assets={assets} items={document.items} disabled={disabled} dirty={dirty} onAdd={add} onRefresh={refreshAssets} />}
          </section>
        </TabsContent>
        <TabsContent value="settings" forceMount className={panel}>
          <div className="flex flex-col gap-8">
            <SettingsGroup title="Details">
              <SettingsRow id="content-title" title="Title"><Input id="content-title" dir="auto" className="h-8 w-48 sm:w-80" maxLength={200} value={document.title} disabled={disabled} onChange={e => setDocument({ ...document, title: e.target.value })} /></SettingsRow>
              <div className="flex flex-col gap-3 px-6 py-5">
                <Label htmlFor="content-description" className="font-medium">Description</Label>
                <Textarea id="content-description" dir="auto" className="min-h-28" maxLength={10000} value={document.description} disabled={disabled} onChange={e => setDocument({ ...document, description: e.target.value })} />
              </div>
            </SettingsGroup>
            <SettingsGroup title="Access">
              <AccessDuration value={document.accessDays} disabled={disabled} onChange={accessDays => setDocument({ ...document, accessDays })} />
            </SettingsGroup>
            <UnitRequirements academyId={academy.id} unitId={unit.id} userId={data.userId} document={document} onChange={setDocument} disabled={disabled} />
          </div>
        </TabsContent>
        <TabsContent value="review" forceMount className={panel}>
          <div className="flex flex-col gap-8">
            <SettingsGroup title="Feedback">
              {data.feedback.map(f => <div key={f.id} className="flex flex-col gap-1 px-6 py-5"><p dir="auto" className="whitespace-pre-wrap text-sm">{f.body}</p><p className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString()}</p></div>)}
              {!data.feedback.length && !(data.manager && editable) && <p className="px-6 py-5 text-sm text-muted-foreground">No feedback yet.</p>}
              {data.manager && editable && <div className="flex flex-col gap-3 px-6 py-5"><Textarea aria-label="Feedback" dir="auto" value={feedback} maxLength={5000} disabled={busy} onChange={e => setFeedback(e.target.value)} /><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" disabled={disabled || dirty || !feedback.trim()} onClick={() => perform("feedback")}>Send feedback</Button><Button size="sm" variant="outline" disabled={disabled || dirty || !feedback.trim()} onClick={() => perform("request_changes")}>Request changes</Button></div></div>}
            </SettingsGroup>
            <SettingsGroup title="Publication history">
              {data.revisions.length > 0
                ? data.revisions.map(r => <div key={r.revision} className="flex items-center justify-between gap-6 px-6 py-4 text-sm"><span className="font-medium">Version {r.revision}</span><span className="text-muted-foreground tabular-nums">{new Date(r.published_at).toLocaleDateString()}</span></div>)
                : <p className="px-6 py-5 text-sm text-muted-foreground">Not published yet.</p>}
            </SettingsGroup>
          </div>
        </TabsContent>
        {unit.published_revision > 0 && <TabsContent value="students" forceMount className={panel}><UnitAccessPanel academyId={academy.id} academySlug={academy.slug} unitId={unit.id} userId={data.userId} /></TabsContent>}
      </Tabs>
    </div>
    {editable && dirty && (
      // Pinned like the account settings bar so saving is reachable from every tab.
      <div role="region" aria-label="Unsaved changes" className="fixed bottom-6 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-lg border bg-popover p-1.5 text-sm shadow-lg animate-in fade-in slide-in-from-bottom-2">
        <span className="px-2 font-medium">Unsaved changes</span>
        <Separator orientation="vertical" className="mx-1 h-5! self-center!" />
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => { setDocument(unit.draft); setError(""); }}>Discard</Button>
        <Button size="sm" disabled={disabled || !document.title.trim()} onClick={() => perform("save")}>
          {busy && <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}
          Save draft
        </Button>
      </div>
    )}
    <AlertDialog open={archiving} onOpenChange={setArchiving}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Archive this unit?</AlertDialogTitle><AlertDialogDescription>It leaves active student learning. Material and history are preserved, and restoring returns it as a draft.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => perform("archive")}>Archive unit</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}

function Count({ value }: { value: number }) { return <span className="text-xs font-normal text-muted-foreground tabular-nums">{value}</span>; }
