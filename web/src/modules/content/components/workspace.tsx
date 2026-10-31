"use client";
import { newUuid } from "@/lib/uuid";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, AlertCircleIcon, Archive02Icon, ArrowDown01Icon, AssignmentsIcon, Books01Icon, Cancel01Icon, CheckListIcon, CheckmarkCircle02Icon, Copy01Icon, LockIcon, Note01Icon, PencilEdit01Icon, Search01Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { formatAcademyLong, formatAcademyRelative } from "@/lib/academy-time";
import { cn } from "@/lib/utils";
import { AcademyGate, useAcademyScope } from "@/modules/auth";
import { canManageLabels, LabelManager, LabelOverflow, labelsQueryKey, useLabels, type Label } from "@/modules/labels";
import type { AcademyEntry } from "@/modules/academies";
import { useCanonicalHref } from "@/modules/navigation";
import { FilterPopover } from "@/components/shared/filter-popover";
import { HeaderActions } from "@/components/shared/header-actions";
import { Segmented } from "@/components/shared/segmented";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { changeUnit, createUnit, copyUnit, loadWorkspace } from "../actions";
import { setUnitLabel } from "../labels";
import { DEFAULT_UNIT_VIEW, STATE_LABELS, UNIT_STATUSES, arrangeUnits, isUnitInReview, matchesLabels, matchesStatuses, materialSummary, prerequisiteName, unwrapContent, type ContentUnit, type UnitView } from "../types";
import type { ContentWorkspace } from "../data";
import { UnitFacts, type UnitFact } from "./facts";
import { KIND_ICONS } from "./kind-icon";
import { UnitActions, UnitMenu, type UnitMenuActions, type UnitSheetTab } from "./menu";
import { UnitSheet } from "./sheet";
import { runUnitAction, UNIT_ACTIONS } from "./unit-action";
import { UnitViewOptions } from "./view-options";

const GRID = "grid gap-3 sm:grid-cols-2 xl:grid-cols-3";
const ALL = "all";
const TABS = [
  { value: "active", label: "Active", match: (u: ContentUnit) => u.state !== "archived" },
  { value: "draft", label: STATE_LABELS.draft, icon: PencilEdit01Icon, match: (u: ContentUnit) => u.state === "draft" },
  { value: "review", label: STATE_LABELS.review, icon: ViewIcon, match: isUnitInReview },
  { value: "published", label: STATE_LABELS.published, icon: CheckmarkCircle02Icon, match: (u: ContentUnit) => u.state === "published" },
  { value: "archived", label: STATE_LABELS.archived, icon: Archive02Icon, match: (u: ContentUnit) => u.state === "archived" },
];

export function ContentWorkspacePage() {
  return <AcademyGate>{academy => <Workspace academy={academy} />}</AcademyGate>;
}
function Workspace({ academy }: { academy: AcademyEntry }) {
  const query = useQuery({ queryKey: ["content", academy.id, "workspace"], queryFn: () => loadWorkspace(academy.id) });
  if (query.isPending) return <main role="status" aria-label="Loading content" className="page-shell"><Skeleton className="h-8 w-48" /><Skeleton className="h-9 w-full" /><div className={GRID}>{[0, 1, 2].map(k => <Skeleton key={k} className="h-40 rounded-lg" />)}</div></main>;
  if (query.isError) return <main className="page-shell"><Alert variant="destructive"><HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} aria-hidden="true" /><AlertTitle>Couldn’t load content</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{query.error.message}<Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? "Retrying…" : "Retry"}</Button></AlertDescription></Alert></main>;
  return <WorkspaceContent academy={academy} data={query.data} />;
}
const keyFor = (level: string, track: string | null) => `${level}/${track ?? "all"}`;
function WorkspaceContent({ academy, data }: { academy: AcademyEntry; data: ContentWorkspace }) {
  const href = useCanonicalHref(), router = useRouter(), cache = useQueryClient();
  const defaultYear = data.years.find(y => !y.closed_at)?.id ?? data.years[0]?.id ?? "";
  const [yearId, setYear] = useState(defaultYear);
  const [program, setProgram] = useState(ALL);
  const [tab, setTab] = useState("active");
  const [search, setSearch] = useState("");
  const [savedView, setView] = useState<UnitView>(DEFAULT_UNIT_VIEW);
  const catalog = useLabels(academy.id, "content").data ?? [];
  // A deleted label can no longer be unselected, so it stops counting as selected.
  const view = { ...savedView, labels: savedView.labels.filter(id => catalog.some(label => label.id === id)) };
  const [managing, setManaging] = useState<{ open: boolean; opener: HTMLElement | null }>({ open: false, opener: null });
  const applying = useRef(0);
  const isCurrent = useAcademyScope();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [modal, setModal] = useState<"new" | "copy" | null>(null);
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  const [archiving, setArchiving] = useState<ContentUnit | null>(null), [changing, setChanging] = useState(false);
  const [sheet, setSheet] = useState<{ unitId: string; tab: UnitSheetTab; opener: HTMLElement | null } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const year = data.years.find(y => y.id === yearId);
  const writable = !!year && !year.closed_at;
  const yearLabel = year ? `${year.start_year}–${year.start_year + 1}` : "";
  const options = data.levels.flatMap(l => [
    { key: keyFor(l.level_id, null), level: l.level_id, track: null as string | null, label: data.levelNames[l.level_id] ?? l.level_id },
    ...data.tracks.filter(t => t.level_id === l.level_id).map(t => ({ key: keyFor(l.level_id, t.id), level: l.level_id, track: t.id, label: `${data.levelNames[l.level_id] ?? l.level_id} · ${t.name}` })),
  ]);
  const selected = options.find(p => p.key === program);
  const programIds = new Set(data.programs.filter(p => p.academic_year_id === yearId && (!selected || (p.level_id === selected.level && p.track_id === selected.track))).map(p => p.id));
  const scoped = data.units.filter(u => programIds.has(u.program_id) && `${u.draft.title} ${u.draft.description}`.toLowerCase().includes(search.trim().toLowerCase()));
  // Status toggles narrow only the Active tab; every other tab already is one status.
  const units = scoped.filter(TABS.find(t => t.value === tab)?.match ?? TABS[0].match).filter(u => (tab !== "active" || matchesStatuses(u, view.statuses)) && matchesLabels(data.labelIds[u.id] ?? [], view));
  const statusesHidden = tab === "active" && view.statuses.length < UNIT_STATUSES.length;
  const filtered = !!search.trim() || program !== ALL || yearId !== defaultYear || statusesHidden || view.labels.length > 0 || view.unlabeled;
  function describe(unit: ContentUnit) {
    const p = data.programs.find(p => p.id === unit.program_id);
    const trackName = p && (data.trackYearLabels.find(label => label.track_id === p.track_id && label.academic_year_id === p.academic_year_id)?.name
      ?? data.historicalTracks.find(t => t.id === p.track_id)?.name);
    return p ? `${data.levelNames[p.level_id] ?? p.level_id}${p.track_id ? ` · ${trackName ?? "Track"}` : ""}` : "Program";
  }
  function clearFilters() { setSearch(""); setProgram(ALL); setYear(defaultYear); setView(current => ({ ...current, statuses: UNIT_STATUSES, labels: [], unlabeled: false })); }
  function open(kind: "new" | "copy", unit?: ContentUnit, from: HTMLElement | null = null) {
    opener.current = from;
    const p = unit && data.programs.find(p => p.id === unit.program_id);
    const key = p && keyFor(p.level_id, p.track_id);
    setTarget(key && options.some(o => o.key === key) ? key : selected?.key ?? ""); setTitle(""); setSource(unit?.id ?? ""); setError(""); setRequestId(newUuid()); setModal(kind);
  }
  function refocus(event: Event) { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus({ preventScroll: true }); } }
  async function change(unit: ContentUnit, action: "archive" | "restore") {
    setChanging(true);
    try {
      unwrapContent(await changeUnit({ academyId: academy.id, unitId: unit.id, version: unit.version, action }));
      toast.success(action === "archive" ? "Unit archived." : "Unit restored as draft.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not complete this change. Please retry."); }
    // A refusal usually means the card is out of date, so refresh either way.
    finally { setArchiving(null); setChanging(false); void cache.invalidateQueries({ queryKey: ["content", academy.id] }); }
  }
  const workspaceKey = ["content", academy.id, "workspace"];
  async function applyLabel(unit: ContentUnit, labelId: string, applied: boolean) {
    const show = (on: boolean) => cache.setQueryData<ContentWorkspace>(workspaceKey, current => {
      if (!current) return current;
      const others = (current.labelIds[unit.id] ?? []).filter(id => id !== labelId);
      return { ...current, labelIds: { ...current.labelIds, [unit.id]: on ? [...others, labelId] : others } };
    });
    await cache.cancelQueries({ queryKey: workspaceKey });
    show(applied);
    applying.current += 1;
    try {
      const result = await setUnitLabel({ academyId: academy.id, unitId: unit.id, labelId, applied });
      if (!result.ok) {
        show(!applied);
        if (result.code === "label_not_found") void cache.invalidateQueries({ queryKey: labelsQueryKey(academy.id, "content") });
        if (isCurrent(academy.id)) toast.error(result.message);
      }
    } catch {
      show(!applied);
      if (isCurrent(academy.id)) toast.error("Could not reach the server. Check your connection and try again.");
    } finally {
      applying.current -= 1;
      // Refreshing between quick changes would bring back the state before the later ones.
      if (applying.current === 0) void cache.invalidateQueries({ queryKey: workspaceKey });
    }
  }
  const menuActions: UnitMenuActions = {
    academyId: academy.id, labelIds: data.labelIds,
    onApplyLabel: (unit, labelId, applied) => void applyLabel(unit, labelId, applied),
    onManageLabels: canManageLabels(academy.role) ? from => setManaging({ open: true, opener: from }) : undefined,
    writable, manager: data.manager, userId: data.userId,
    onAction: (unit, action) => void runUnitAction({ academyId: academy.id, unitId: unit.id, version: unit.version }, action)
      .then(() => toast.success(UNIT_ACTIONS[action].done), e => toast.error(e instanceof Error ? e.message : "Could not complete this change. Please retry."))
      // A refusal usually means the card is out of date, so refresh either way.
      .finally(() => void cache.invalidateQueries({ queryKey: ["content", academy.id] })),
    onClone: (unit, from) => open("copy", unit, from),
    onArchive: (unit, from) => { opener.current = from; setArchiving(unit); },
    onRestore: unit => void change(unit, "restore"),
    onSheet: (unit, from, tab) => setSheet({ unitId: unit.id, tab, opener: from }),
  };
  async function submit() {
    const scope = options.find(p => p.key === target);
    if (!scope || !writable) return;
    setBusy(true); setError("");
    try {
      const ids = { academyId: academy.id, yearId, levelId: scope.level, trackId: scope.track, unitId: requestId };
      const id = unwrapContent(modal === "copy" ? await copyUnit({ ...ids, sourceId: source }) : await createUnit({ ...ids, title }));
      router.push(href(`/app/content/${id}`));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create the unit. Retry with the same action."); setBusy(false); }
  }
  const cards = (list: ContentUnit[]) => <ul className={GRID}>{list.map(u => <UnitMenu key={u.id} unit={u} href={href(`/app/content/${u.id}`)} actions={menuActions}><li className="min-w-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"><UnitCard unit={u} program={describe(u)} href={href(`/app/content/${u.id}`)} actions={menuActions} units={data.units} labels={catalog.filter(label => data.labelIds[u.id]?.includes(label.id))} /></li></UnitMenu>)}</ul>;
  return <main className="page-shell min-w-0">
    {year?.closed_at && <Alert><HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} aria-hidden="true" /><AlertTitle>{yearLabel} is closed</AlertTitle><AlertDescription>Its units are read-only.</AlertDescription></Alert>}
    <HeaderActions>
      <div className="max-w-[calc(100vw-10rem)] overflow-x-auto">
        <Segmented label="Status" value={tab} className="h-9" hideSelectedHint onChange={setTab} options={TABS.map(t => ({
          value: t.value, hint: t.icon && t.label,
          label: <>{t.icon && <HugeiconsIcon icon={t.icon} strokeWidth={1.5} className="size-4" aria-hidden="true" />}<span className={cn("grid transition-[grid-template-columns,margin-left] duration-200 ease-out motion-reduce:transition-none", !t.icon ? "grid-cols-[1fr]" : tab === t.value ? "ml-1.5 grid-cols-[1fr]" : "grid-cols-[0fr]")}><span className="overflow-hidden">{t.label}</span></span></>,
        }))} />
      </div>
    </HeaderActions>
    <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:items-center sm:gap-3 xl:grid-cols-3">
      <InputGroup>
        <InputGroupInput type="search" className="[&::-webkit-search-cancel-button]:appearance-none" placeholder="Search units..." aria-label="Search units" value={search} onChange={e => setSearch(e.target.value)} />
        <InputGroupAddon><HugeiconsIcon icon={Search01Icon} strokeWidth={1.5} aria-hidden="true" /></InputGroupAddon>
        {search && <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" className="text-muted-foreground hover:text-foreground" aria-label="Clear search" onClick={() => setSearch("")}><HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} className="size-3.5" aria-hidden="true" /></InputGroupButton></InputGroupAddon>}
      </InputGroup>
      <div className="flex items-center justify-between gap-2 sm:justify-end xl:col-span-2">
        <FilterPopover iconOnly fields={[
          { id: "year", label: "Year", value: yearId, defaultValue: defaultYear, options: data.years.map(y => ({ value: y.id, label: `${y.start_year}–${y.start_year + 1}${y.closed_at ? " · closed" : ""}` })), onChange: value => { setYear(value); setProgram(ALL); } },
          { id: "program", label: "Program", value: program, defaultValue: ALL, options: [{ value: ALL, label: "All programs" }, ...options.map(p => ({ value: p.key, label: p.label }))], onChange: setProgram },
        ]}><UnitViewOptions view={view} showStatuses={tab === "active"} labels={catalog} onChange={setView} />
          {canManageLabels(academy.role) && <LabelManager academyId={academy.id} domain="content" open={managing.open} opener={managing.opener} onChanged={() => void cache.invalidateQueries({ queryKey: workspaceKey })}
            // Opening from the toolbar anchors there; closing keeps the opener so focus can return to it.
            onOpenChange={next => setManaging(current => next ? { open: next, opener: null } : { ...current, open: false })} />}
        </FilterPopover>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button disabled={!writable} className="shrink-0"><HugeiconsIcon icon={Add01Icon} strokeWidth={1.5} aria-hidden="true" />New</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => open("new")}><HugeiconsIcon icon={Add01Icon} strokeWidth={1.5} aria-hidden="true" />Start from scratch</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => open("copy")}><HugeiconsIcon icon={Copy01Icon} strokeWidth={1.5} aria-hidden="true" />Clone an existing unit</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    {units.length === 0
      ? <Empty className="min-h-56 rounded-xl border border-dashed bg-card/20"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={Books01Icon} strokeWidth={1.5} aria-hidden="true" /></EmptyMedia><EmptyTitle>{filtered ? "No matching units" : "No units yet"}</EmptyTitle></EmptyHeader>{filtered && <EmptyContent><Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button></EmptyContent>}</Empty>
      : <div className="flex flex-col gap-5">{arrangeUnits(units, view, describe).map(group => {
        if (!group.label) return <div key="all">{cards(group.units)}</div>;
        const open = !collapsed.has(group.label);
        return <Collapsible key={group.label} open={open} onOpenChange={() => setCollapsed(current => { const next = new Set(current); if (open) next.add(group.label); else next.delete(group.label); return next; })} className="flex flex-col gap-2">
          <h2><CollapsibleTrigger asChild><button type="button" className="flex items-center gap-1.5 rounded-sm text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"><HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.5} aria-hidden="true" className={cn("size-4 text-muted-foreground transition-transform motion-reduce:transition-none", !open && "-rotate-90")} />{group.label}</button></CollapsibleTrigger></h2>
          <CollapsibleContent>{cards(group.units)}</CollapsibleContent>
        </Collapsible>;
      })}</div>}
    {sheet && <UnitSheet academyId={academy.id} unitId={sheet.unitId} tab={sheet.tab} opener={sheet.opener} onClose={() => setSheet(null)}
      onArchive={unit => { opener.current = sheet.opener; setSheet(null); setArchiving(unit); }} />}
    <Dialog open={modal !== null} onOpenChange={open => { if (!busy && !open) setModal(null); }}><DialogContent onCloseAutoFocus={refocus}><DialogHeader><DialogTitle>{modal === "copy" ? "Copy a published unit" : "New unit"}</DialogTitle><DialogDescription>{yearLabel}</DialogDescription></DialogHeader>
      <FieldGroup>
        <Field><FieldLabel htmlFor="unit-program">Program</FieldLabel><Select value={target} onValueChange={setTarget} disabled={busy}><SelectTrigger id="unit-program" className="w-full"><SelectValue placeholder="Choose a program" /></SelectTrigger><SelectContent>{options.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent></Select></Field>
        {modal === "new"
          ? <Field><FieldLabel htmlFor="unit-title">Title</FieldLabel><Input id="unit-title" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} disabled={busy} /></Field>
          : <Field><FieldLabel htmlFor="unit-source">Published unit</FieldLabel><Select value={source} onValueChange={setSource} disabled={busy}><SelectTrigger id="unit-source" className="w-full"><SelectValue placeholder="Choose a published unit" /></SelectTrigger><SelectContent>{data.units.filter(u => u.state === "published").map(u => <SelectItem key={u.id} value={u.id}>{u.draft.title} · {describe(u)}</SelectItem>)}</SelectContent></Select></Field>}
      </FieldGroup>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setModal(null)}>Cancel</Button><Button disabled={busy || !target || (modal === "new" ? !title.trim() : !source)} onClick={submit}>{busy ? "Creating…" : modal === "copy" ? "Copy as draft" : "Create draft"}</Button></DialogFooter>
    </DialogContent></Dialog>
    <AlertDialog open={archiving !== null} onOpenChange={open => { if (!open && !changing) setArchiving(null); }}><AlertDialogContent onCloseAutoFocus={refocus}><AlertDialogHeader><AlertDialogTitle>Archive this unit?</AlertDialogTitle><AlertDialogDescription>It leaves active student learning. Material and history are preserved, and restoring returns it as a draft.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={changing}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={changing} onClick={event => { event.preventDefault(); if (archiving) void change(archiving, "archive"); }}>{changing ? "Archiving…" : "Archive unit"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}

const MATERIALS = [
  { key: "videos", icon: KIND_ICONS.explanation, label: "Videos" },
  { key: "assignments", icon: AssignmentsIcon, label: "Assignments" },
  { key: "quizzes", icon: CheckListIcon, label: "Quizzes" },
  { key: "exams", icon: Note01Icon, label: "Exams" },
  { key: "files", icon: KIND_ICONS.document, label: "Files" },
] as const;

function UnitCard({ unit, program, href, actions, units, labels }: { unit: ContentUnit; program: string; href: string; actions: UnitMenuActions; units: ContentUnit[]; labels: Label[] }) {
  const { title, description, items, prerequisites = [] } = unit.draft;
  const summary = materialSummary(items);
  const facts: UnitFact[] = MATERIALS.filter(m => summary[m.key].length > 0).map(m => ({ ...m, rows: summary[m.key] }));
  if (prerequisites.length > 0) facts.push({ key: "prerequisites", icon: LockIcon, label: "Prerequisites", rows: prerequisites.map(p => ({ title: prerequisiteName(p, units) })) });
  return <Card size="sm" className={cn("relative h-full gap-0 rounded-lg py-0 ring-0 transition-colors has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 hover:bg-muted/30", unit.state === "archived" && "opacity-60")}>
    <div className="flex items-start gap-3 p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 dir="auto" className="line-clamp-2 text-base font-semibold text-foreground"><Link href={href} className="outline-none after:absolute after:inset-0 after:rounded-lg">{title}</Link></h3>
        <p className="truncate text-xs text-muted-foreground">{program}</p>
        {description && <p dir="auto" className="mt-2 line-clamp-2 text-sm text-muted-foreground">{description}</p>}
      </div>
      {/* Above the stretched link so it can be clicked. */}
      <div className="relative z-10 -mt-1 -mr-1"><UnitActions unit={unit} href={href} actions={actions} /></div>
    </div>
    {/* Status keeps this line present and bottom-aligned across the grid, so adding the first label doesn't resize the card. */}
    <div className="mt-auto mb-3 flex flex-wrap items-center gap-1.5 px-4">
      <Badge variant={unit.state === "published" ? "default" : "secondary"}>{STATE_LABELS[unit.state]}</Badge>
      {unit.review_requested_at && unit.state !== "review" && <Badge variant="outline">In review</Badge>}
      {unit.state === "published" && unit.version !== unit.published_version && <Badge variant="outline">Unpublished changes</Badge>}
      {labels.length > 0 && <Separator orientation="vertical" className="h-3 data-vertical:self-auto" />}
      <LabelOverflow labels={labels} />
    </div>
    <div className="flex h-10 shrink-0 items-center gap-x-0.5 border-t border-border/70 pr-2.5 pl-4 text-xs text-muted-foreground">
      {items.length === 0 && <span>No materials</span>}
      <UnitFacts facts={facts} />
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <span className="relative z-10 ml-auto cursor-default px-1.5 whitespace-nowrap"><span aria-hidden="true">{formatAcademyRelative(unit.updated_at)}</span><span className="sr-only">Updated {formatAcademyLong(unit.updated_at)}</span></span>
        </TooltipTrigger>
        <TooltipContent>Updated {formatAcademyLong(unit.updated_at)}</TooltipContent>
      </Tooltip>
    </div>
  </Card>;
}
