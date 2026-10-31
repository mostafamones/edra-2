"use client";
import { useEffect, useEffectEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, Archive02Icon, Cancel01Icon, CloudSavingDone01Icon } from "@hugeicons/core-free-icons";
import { DiscardDialog } from "@/components/shared/assessment/discard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FloatingSheet, FloatingSheetClose, FloatingSheetContent, FloatingSheetHeader, FloatingSheetTitle } from "@/components/ui/floating-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadUnit, saveUnit } from "../actions";
import { sameDocument } from "../revisions";
import { canEditUnit, documentSchema, unwrapContent, type ContentDocument, type ContentUnit } from "../types";
import { UnitHistoryList } from "./history";
import { MaterialReadOnly } from "./list";
import type { UnitSheetTab } from "./menu";
import { UnitSettings } from "./settings";
import { runUnitAction, UNIT_ACTIONS, unitAction, type UnitAction } from "./unit-action";

const TABS: { value: UnitSheetTab; label: string }[] = [{ value: "edit", label: "Edit" }, { value: "history", label: "History" }, { value: "content", label: "Content" }];
// Typing in a text field is saved once the field loses focus, as in the editor.
const TYPING = "input:not([type=file]):not([type=checkbox]):not([type=radio]), textarea";
// A tab enters from the side it sits on, relative to the one being left.
const ENTER = "duration-200 ease-out data-[state=active]:animate-in data-[state=active]:fade-in-0";

/** A unit's settings, history and read-only material, opened from the library without leaving it. */
export function UnitSheet({ academyId, unitId, tab: initialTab, opener, onClose, onArchive }: {
  academyId: string; unitId: string; tab: UnitSheetTab; opener: HTMLElement | null; onClose: () => void; onArchive: (unit: ContentUnit) => void;
}) {
  const cache = useQueryClient();
  const unitKey = ["content", academyId, "unit", unitId];
  const query = useQuery({ queryKey: unitKey, queryFn: () => loadUnit(academyId, unitId), refetchOnWindowFocus: false });
  const data = query.data;
  const [tab, setTab] = useState(initialTab);
  const [slide, setSlide] = useState("");
  const [saved, setSaved] = useState<{ version: number; draft: ContentDocument } | null>(null);
  const [document, setDocument] = useState<ContentDocument | null>(null);
  const [saving, setSaving] = useState(false), [failed, setFailed] = useState<ContentDocument | null>(null), [error, setError] = useState("");
  const [focusTick, setFocusTick] = useState(0), [leaving, setLeaving] = useState(false);
  // The first load, or a change made elsewhere, replaces the local draft. The cache can briefly lag behind our own save.
  if (data && !saving && (!saved || data.unit.version > saved.version)) { setSaved({ version: data.unit.version, draft: data.unit.draft }); setDocument(data.unit.draft); }
  const closed = !!data?.program.academic_years.closed_at;
  const editable = !!data && canEditUnit(data.unit, data.userId, data.manager) && !closed;
  const dirty = JSON.stringify(document) !== JSON.stringify(saved?.draft ?? null);
  const [busy, setBusy] = useState(false);
  const canManage = !!data?.manager && !closed;
  // A draft that matches the live publication has nothing to publish or review.
  const unpublished = !!data && (!data.unit.published_revision || !sameDocument(document, data.revisions[0]?.document));

  async function save() {
    if (!document || !saved) return false;
    const sent = document, parsed = documentSchema.safeParse(sent);
    if (!parsed.success) { setFailed(sent); setError(parsed.error.issues[0]?.message ?? "Check the fields."); return false; }
    setSaving(true); setError("");
    try {
      unwrapContent(await saveUnit({ academyId, unitId, version: saved.version, document: parsed.data }));
      const latest = await loadUnit(academyId, unitId);
      setSaved({ version: latest.unit.version, draft: sent });
      cache.setQueryData(unitKey, latest);
      void cache.invalidateQueries({ queryKey: ["content", academyId] });
      return true;
    } catch (e) { setFailed(sent); setError(e instanceof Error ? e.message : "Could not save the draft."); return false; }
    finally { setSaving(false); }
  }
  const autosave = useEffectEvent(() => void save());
  useEffect(() => {
    // A failed draft is retried by the next edit or Retry, not in a loop.
    if (!dirty || !editable || saving || failed === document) return;
    const timer = setTimeout(() => { if (!globalThis.document.activeElement?.matches(TYPING)) autosave(); }, 800);
    return () => clearTimeout(timer);
  }, [document, dirty, editable, saving, failed, focusTick]);
  useEffect(() => {
    if (!dirty && !saving) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty, saving]);
  async function perform(action: UnitAction) {
    if (!saved) return;
    setBusy(true); setError("");
    try {
      await runUnitAction({ academyId, unitId, version: saved.version }, action);
      toast.success(UNIT_ACTIONS[action].done);
      await cache.invalidateQueries({ queryKey: ["content", academyId] });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not complete the action."); }
    finally { setBusy(false); }
  }
  function changeTab(value: UnitSheetTab) {
    const order = TABS.map(t => t.value);
    setSlide(order.indexOf(value) > order.indexOf(tab) ? "data-[state=active]:slide-in-from-right-8" : "data-[state=active]:slide-in-from-left-8");
    setTab(value);
  }
  // Closing saves what's still pending; if that fails, the draft is only dropped on confirmation.
  async function leave() {
    if (saving) return;
    if (dirty && editable && !(await save())) { setLeaving(true); return; }
    onClose();
  }

  const failure = error && <Alert variant="destructive" role="alert"><HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} /><AlertTitle>Couldn’t complete the action</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;

  return <>
    <FloatingSheet open onOpenChange={next => { if (!next) void leave(); }}>
      <FloatingSheetContent className="w-xl gap-0" showCloseButton={false} aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); if (opener?.isConnected) opener.focus({ preventScroll: true }); }}>
        <Tabs value={tab} onValueChange={value => changeTab(value as UnitSheetTab)} className="min-h-0 flex-1 gap-0">
          {/* The tabs are the visible title; the dialog keeps a name for assistive technology. */}
          <FloatingSheetHeader className="shrink-0 flex-row items-center justify-between gap-3 border-b px-6 pt-3 pb-0">
            <FloatingSheetTitle className="sr-only">{document?.title.trim() || data?.unit.draft.title || "Unit"}</FloatingSheetTitle>
            {/* Line tabs whose active underline sits on the header's bottom border. */}
            <TabsList variant="line" className="h-auto gap-1 p-0">
              {TABS.map(({ value, label }) => <TabsTrigger key={value} value={value} className="h-auto flex-none rounded-none px-2 pt-1 pb-3 text-base font-semibold group-data-horizontal/tabs:after:bottom-[-1px]">{label}</TabsTrigger>)}
            </TabsList>
            <div className="mb-2 flex items-center gap-1">
              {editable && tab === "edit" && (saving ? <span role="status" className="text-xs text-muted-foreground">Saving…</span>
                : failed === document ? <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setFailed(null)}>Not saved · Retry</Button>
                : dirty ? <span role="status" className="text-xs text-muted-foreground">Unsaved</span>
                : <span role="status" aria-label="Saved" title="Saved" className="flex size-7 items-center justify-center text-muted-foreground"><HugeiconsIcon icon={CloudSavingDone01Icon} strokeWidth={1.5} className="size-4" aria-hidden="true" /></span>)}
              <FloatingSheetClose asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="Close" disabled={saving}><HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} aria-hidden="true" /></Button></FloatingSheetClose>
            </div>
          </FloatingSheetHeader>
          {!data || !document ? (query.isError
            ? <div className="flex flex-col items-start gap-3 p-6"><p role="alert">Couldn’t load this unit.</p><Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></div>
            : <div role="status" aria-label="Loading unit" className="space-y-4 p-6"><Skeleton className="h-10" /><Skeleton className="h-32" /></div>)
            : <>
              {/* Stays mounted so its state survives switching tabs. */}
              <TabsContent value="edit" forceMount onBlur={() => setFocusTick(focusTick + 1)} className={`flex min-h-0 flex-col gap-4 overflow-y-auto p-6 data-[state=inactive]:hidden ${slide} ${ENTER}`}>
                {closed && <Alert><HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} /><AlertTitle>This academic year is closed. The unit is read-only.</AlertTitle></Alert>}
                {failure}
                <UnitSettings academyId={academyId} unitId={unitId} userId={data.userId} document={document} disabled={!editable} onChange={setDocument}>
                  {data.manager && !closed && data.unit.state !== "archived" && <Button variant="outline" className="mt-auto self-end text-destructive hover:text-destructive" disabled={saving || dirty} onClick={() => onArchive(data.unit)}><HugeiconsIcon icon={Archive02Icon} strokeWidth={1.5} aria-hidden="true" />Archive unit</Button>}
                </UnitSettings>
              </TabsContent>
              <TabsContent value="history" className={`flex min-h-0 flex-col gap-4 overflow-y-auto p-6 ${slide} ${ENTER}`}>
                {failure}
                <UnitHistoryList academyId={academyId} unitId={unitId} userId={data.userId} live={data.unit.state !== "archived"} disabled={busy || saving || dirty}
                  action={unitAction(data.unit, { editable, manager: canManage, changed: unpublished })} onAction={action => void perform(action)} />
              </TabsContent>
              <TabsContent value="content" className={`flex min-h-0 flex-col gap-4 overflow-y-auto p-6 ${slide} ${ENTER}`}>
                {failure}
                <MaterialReadOnly academyId={academyId} items={document.items} assets={data.assets} onRefreshed={() => cache.invalidateQueries({ queryKey: unitKey })} onError={setError} />
              </TabsContent>
            </>}
        </Tabs>
      </FloatingSheetContent>
    </FloatingSheet>
    <DiscardDialog noun="unit" open={leaving} onOpenChange={setLeaving} onDiscard={async () => { setLeaving(false); onClose(); }} />
  </>;
}
