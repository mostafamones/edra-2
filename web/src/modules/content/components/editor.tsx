"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, Archive02Icon, ArchiveRestoreIcon, CloudSavingDone01Icon, SidebarRightIcon, SentIcon, Tick02Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { AcademyGate } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { OverlayPanel } from "@/components/ui/overlay-panel";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { HeaderActions } from "@/components/shared/header-actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { changeUnit, loadUnit, publishUnitEdits, saveUnit } from "../actions";
import { refreshVideo } from "../media-actions";
import type { ContentDetail } from "../data";
import { canEditUnit, documentSchema, STATE_LABELS, unwrapContent, type ContentDocument, type ContentItem } from "../types";
import { MaterialList } from "./list";
import { useMaterialUpload } from "./uploader";
import { canAttach, linkMaterial } from "./tree";
import { AccessSearch, accessOptions, UnitAccessPanel } from "../access/manager";
import { requirementOptions, UnitRequirements } from "../requirements/editor";
import { AccessDuration } from "./duration";
import { VersionHistory } from "./history";
import { sameDocument } from "../revisions";
import { unitPanelOptions } from "../panels";

export function ContentEditorPage({ unitId }: { unitId: string }) { return <AcademyGate>{academy => <Editor academy={academy} unitId={unitId} />}</AcademyGate>; }
function Editor({ academy, unitId }: { academy: AcademyEntry; unitId: string }) {
  const query = useQuery({ queryKey: ["content", academy.id, "unit", unitId], queryFn: () => loadUnit(academy.id, unitId), refetchOnWindowFocus: false });
  useBreadcrumbTitle(query.data?.unit.draft.title ?? "Unit");
  if (query.isPending) return <main role="status" aria-label="Loading unit" className="page-shell min-w-0">
    <div className="min-w-0 space-y-1.5"><Skeleton className="h-5 w-16 rounded-sm" /><Skeleton className="h-8 w-56" /><Skeleton className="h-5 w-44" /></div>
    <div className="flex flex-col gap-6">
      <div className="flex h-9 items-center gap-2 border-b px-2"><Skeleton className="h-5 w-20" /></div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 rounded-lg bg-card px-3 py-3"><Skeleton className="size-10 shrink-0 rounded-lg" /><div className="min-w-0 flex-1 space-y-1.5"><Skeleton className="h-4 w-48 max-w-full" /><Skeleton className="h-3.5 w-28 max-w-full" /></div><Skeleton className="h-8 w-20 shrink-0 rounded-md" /></div>
        <div className="grid items-start gap-2 sm:grid-cols-2">{[0, 1].map(i => <div key={i} className="flex items-center gap-3 rounded-lg bg-card px-3 py-3"><Skeleton className="size-10 shrink-0 rounded-lg" /><Skeleton className="h-4 w-36" /></div>)}</div>
      </div>
    </div>
  </main>;
  if (query.isError) return <main className="page-shell"><Alert variant="destructive"><HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} /><AlertTitle>Couldn’t load unit</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{query.error.message}<Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? "Retrying…" : "Retry"}</Button></AlertDescription></Alert></main>;
  return <UnitEditor key={unitId} academy={academy} data={query.data} />;
}
// Typing in a text field is saved once the field loses focus (Enter does that for material titles).
const TYPING = "input:not([type=file]):not([type=checkbox]):not([type=radio]), textarea";
function UnitEditor({ academy, data }: { academy: AcademyEntry; data: ContentDetail }) {
  const cache = useQueryClient();
  const { unit, program } = data;
  const [saved, setSaved] = useState({ version: unit.version, draft: unit.draft });
  const [document, setDocument] = useState<ContentDocument>(unit.draft);
  // Saved drafts to step back through; each autosave is one step, so a burst of moves undoes together.
  const [undo, setUndo] = useState<ContentDocument[]>([]);
  const [saving, setSaving] = useState(false), [failed, setFailed] = useState<ContentDocument | null>(null), [focusTick, setFocusTick] = useState(0);
  const undoing = useRef(false);
  // A change made elsewhere (an action, another editor, an assessment created in the unit) replaces the local draft.
  // Versions only grow; the cache can briefly lag behind our own save, which must not count as an outside change.
  if (unit.version > saved.version && !saving) { setSaved({ version: unit.version, draft: unit.draft }); setDocument(unit.draft); setUndo([]); }
  const [assets, setAssets] = useState(data.assets);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const upload = useMaterialUpload({ academyId: academy.id, unitId: unit.id, onUploaded: uploaded });
  const uploading = upload.busy;
  const [archiving, setArchiving] = useState(false), [settingsOpen, setSettingsOpen] = useState(false), [accessSearch, setAccessSearch] = useState(""), [accessDraft, setAccessDraft] = useState(""), [tab, setTab] = useState("material");
  const closed = !!program.academic_years.closed_at;
  const editable = canEditUnit(unit, data.userId, data.manager) && !closed;
  const disabled = busy || uploading || !editable;
  const dirty = JSON.stringify(document) !== JSON.stringify(saved.draft);
  const canManage = data.manager && !closed;
  // A draft that matches the live publication (for example after undoing every edit) has nothing to publish or review.
  const unpublished = !unit.published_revision || !sameDocument(document, data.revisions[0]?.document);
  useEffect(() => {
    // Panels and tabs fetch in the background so they open without a loading state.
    void cache.prefetchQuery(unitPanelOptions(academy.id, unit.id));
    void cache.prefetchQuery(requirementOptions(academy.id, unit.id, data.userId));
    if (unit.published_revision > 0) void cache.prefetchQuery(accessOptions(academy.id, unit.id, data.userId));
  }, [cache, academy.id, unit.id, data.userId, unit.published_revision]);
  useEffect(() => {
    if (!dirty && !uploading && !saving) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", protect); return () => window.removeEventListener("beforeunload", protect);
  }, [dirty, uploading, saving]);
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
  async function save() {
    const sent = document, parsed = documentSchema.safeParse(sent);
    if (!parsed.success) { setFailed(sent); setError(parsed.error.issues[0]?.message ?? "Check the fields."); return; }
    setSaving(true); setError("");
    try {
      unwrapContent(await saveUnit({ academyId: academy.id, unitId: unit.id, version: saved.version, document: parsed.data }));
      const latest = await loadUnit(academy.id, unit.id);
      if (!undoing.current) setUndo(stack => [...stack.slice(-49), saved.draft]);
      undoing.current = false;
      setSaved({ version: latest.unit.version, draft: sent });
      cache.setQueryData(["content", academy.id, "unit", unit.id], latest);
      void reload();
    } catch (e) { setFailed(sent); setError(e instanceof Error ? e.message : "Could not save the draft."); }
    finally { setSaving(false); }
  }
  function revert() {
    if (dirty) { setDocument(saved.draft); return; }
    const previous = undo.at(-1);
    if (!previous) return;
    undoing.current = true; setUndo(undo.slice(0, -1)); setDocument(previous);
  }
  const autosave = useEffectEvent(() => void save());
  useEffect(() => {
    // A failed draft is retried by the next edit or Retry, not in a loop.
    if (!dirty || !editable || busy || saving || failed === document) return;
    const timer = setTimeout(() => { if (!globalThis.document.activeElement?.matches(TYPING)) autosave(); }, 800);
    return () => clearTimeout(timer);
  }, [document, dirty, editable, busy, saving, failed, focusTick]);
  async function perform(action: string) {
    setBusy(true); setError("");
    try {
      if (action === "publish" && dirty) {
        const parsed = documentSchema.safeParse(document);
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the fields.");
        unwrapContent(await publishUnitEdits({ academyId: academy.id, unitId: unit.id, version: saved.version, document: parsed.data }));
      }
      else {
        if (dirty) throw new Error("Wait for your edits to save before this action.");
        unwrapContent(await changeUnit({ academyId: academy.id, unitId: unit.id, version: saved.version, action }));
      }
      toast.success("Changes saved."); await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not complete the action."); }
    finally { setBusy(false); }
  }
  const add = (item: ContentItem) => setDocument(current => item.assetId && current.items.some(existing => existing.assetId === item.assetId && existing.kind === item.kind && existing.assessmentId === item.assessmentId && existing.assessmentKind === item.assessmentKind) ? current : ({ ...current, items: [...current.items, item] }));
  async function uploaded(item: ContentItem, parent?: ContentItem) {
    // A fresh upload's kind already says whether it is a document.
    if (parent && canAttach(item, parent, i => i.kind === "document")) setDocument(current => ({ ...current, items: linkMaterial(current.items, item, parent, i => i.kind === "document") }));
    else add(item);
    try { await refreshAssets(); } catch { setError("Upload finished. Refresh processing status if it does not appear yet."); }
  }
  const actions = <>
    <div className="flex items-center">
    {editable && (saving ? <span role="status" className="text-xs text-muted-foreground">Saving…</span>
      : failed === document ? <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setFailed(null)}>Not saved · Retry</Button>
      : dirty ? <span role="status" className="text-xs text-muted-foreground">Unsaved</span>
      : <span role="status" aria-label="Saved" title="Saved" className="flex size-9 items-center justify-center text-muted-foreground"><HugeiconsIcon icon={CloudSavingDone01Icon} strokeWidth={1.5} className="size-4" aria-hidden="true" /></span>)}
    {editable && <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="Undo" disabled={disabled || saving || (!dirty && !undo.length)} onClick={revert}><HugeiconsIcon icon={Undo02Icon} strokeWidth={1.5} /></Button></TooltipTrigger><TooltipContent>Undo</TooltipContent></Tooltip>}
    <VersionHistory academyId={academy.id} unitId={unit.id} userId={data.userId} live={unit.state !== "archived"} disabled={disabled || dirty}
      onSubmit={editable && !canManage && unpublished ? () => perform("submit") : undefined} onPublish={canManage && unit.state !== "archived" && unpublished ? () => perform("publish") : undefined} />
    </div>
    {/* Publishing is the review, so whoever can publish only publishes; everyone else submits for review. */}
    {editable && unpublished && !(canManage && unit.state !== "archived") && <Button disabled={disabled || dirty} onClick={() => perform("submit")}><HugeiconsIcon icon={SentIcon} strokeWidth={1.5} aria-hidden="true" />Submit for review</Button>}
    {canManage && unit.state !== "archived" && unpublished && <Button disabled={disabled} onClick={() => perform("publish")}><HugeiconsIcon icon={Tick02Icon} strokeWidth={1.5} aria-hidden="true" />{unit.published_revision ? "Publish changes" : "Publish unit"}</Button>}
    {canManage && unit.state === "archived" && <Button variant="outline" disabled={busy} onClick={() => perform("restore")}><HugeiconsIcon icon={ArchiveRestoreIcon} strokeWidth={1.5} aria-hidden="true" />Restore as draft</Button>}
    <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="Settings" aria-pressed={settingsOpen} onClick={() => setSettingsOpen(open => !open)}><HugeiconsIcon icon={SidebarRightIcon} strokeWidth={1.5} /></Button></TooltipTrigger><TooltipContent>Settings</TooltipContent></Tooltip>
  </>;
  // Panels stay mounted so in-flight uploads and field state survive switching tabs.
  const panel = "data-[state=inactive]:hidden";
  return <div className="relative flex flex-1" onBlur={() => setFocusTick(focusTick + 1)}>
  <main className="page-shell min-w-0">
    <HeaderActions><div className="flex items-center gap-2">{actions}</div></HeaderActions>
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={unit.state === "published" ? "default" : "secondary"}>{STATE_LABELS[unit.state]}</Badge>
        {unit.review_requested_at && unit.state !== "review" && <Badge variant="outline">In review</Badge>}
        {unit.state === "published" && unpublished && <Badge variant="outline">Unpublished changes</Badge>}
      </div>
      <h1 dir="auto" className="text-2xl font-bold tracking-tight break-words">{document.title.trim() || unit.draft.title}</h1>
      <p className="text-sm text-muted-foreground">{data.programLabel} · {program.academic_years.start_year}–{program.academic_years.start_year + 1}</p>
    </div>
    {closed && <Alert><HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} /><AlertTitle>This academic year is closed. The unit is read-only.</AlertTitle></Alert>}
    {error && <Alert variant="destructive" role="alert"><HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} /><AlertTitle>Couldn’t complete the action</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <Tabs value={tab} onValueChange={setTab} className="gap-6">
      {/* The tab underline stops short of the students search, leaving a gap in the line. */}
      <div className="flex items-center gap-3">
      <TabsList variant="line" className="min-w-0 flex-1 justify-start overflow-x-auto border-b">
        <TabsTrigger value="material" className="flex-none">Material<Count value={document.items.length} /></TabsTrigger>
        {unit.published_revision > 0 && <TabsTrigger value="students" className="flex-none">Students</TabsTrigger>}
      </TabsList>
      {tab === "students" && <AccessSearch academyId={academy.id} unitId={unit.id} userId={data.userId} draft={accessDraft} onDraft={setAccessDraft} onSearch={setAccessSearch} />}
      </div>
      <TabsContent value="material" forceMount className={panel}>
        <MaterialList academyId={academy.id} unitId={unit.id} version={saved.version} items={document.items} assets={assets} editable={editable} disabled={disabled} dirty={dirty} upload={upload}
          onItems={change => setDocument(current => ({ ...current, items: change(current.items) }))} onAdd={add} onChanged={reload} onRefreshAssets={refreshAssets} onError={setError} />
      </TabsContent>
      {unit.published_revision > 0 && <TabsContent value="students" forceMount className={panel}><UnitAccessPanel academyId={academy.id} unitId={unit.id} userId={data.userId} search={accessSearch} onClearSearch={() => { setAccessDraft(""); setAccessSearch(""); }} /></TabsContent>}
    </Tabs>
    <AlertDialog open={archiving} onOpenChange={setArchiving}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Archive this unit?</AlertDialogTitle><AlertDialogDescription>It leaves active student learning. Material and history are preserved, and restoring returns it as a draft.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => perform("archive")}>Archive unit</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>
    {settingsOpen && <OverlayPanel aria-label="Settings" className="w-96">
      <h2 className="font-semibold">Settings</h2>
      <FieldGroup className="gap-4">
        <Field><FieldLabel htmlFor="content-title">Title</FieldLabel><Input id="content-title" dir="auto" maxLength={200} value={document.title} disabled={disabled} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} onChange={e => setDocument({ ...document, title: e.target.value })} /></Field>
        <Field><FieldLabel htmlFor="content-description">Description</FieldLabel><Textarea id="content-description" dir="auto" className="min-h-28" maxLength={10000} value={document.description} disabled={disabled} onChange={e => setDocument({ ...document, description: e.target.value })} /></Field>
      </FieldGroup>
      <Separator className="bg-border/70" />
      <section aria-labelledby="unit-access" className="flex flex-col gap-4">
        <h3 id="unit-access" className="text-sm font-medium text-muted-foreground">Access</h3>
        <AccessDuration value={document.accessDays} disabled={disabled} onChange={accessDays => setDocument({ ...document, accessDays })} />
        <UnitRequirements academyId={academy.id} unitId={unit.id} userId={data.userId} document={document} onChange={setDocument} disabled={disabled} />
      </section>
      {canManage && unit.state !== "archived" && <><Button variant="outline" className="mt-auto self-end text-destructive hover:text-destructive" disabled={busy || uploading || dirty} onClick={() => setArchiving(true)}><HugeiconsIcon icon={Archive02Icon} strokeWidth={1.5} aria-hidden="true" />Archive unit</Button></>}
    </OverlayPanel>}
  </div>;
}

function Count({ value }: { value: number }) { return <span className="text-xs font-normal text-muted-foreground tabular-nums">{value}</span>; }
