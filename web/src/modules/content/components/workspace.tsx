"use client";
import { newUuid } from "@/lib/uuid";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, AlertCircleIcon, Books01Icon, Cancel01Icon, Clock01Icon, Copy01Icon, FileAttachmentIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { AcademyGate } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { useCanonicalHref } from "@/modules/navigation";
import { FilterPopover } from "@/components/shared/filter-popover";
import { HeaderActions } from "@/components/shared/header-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createUnit, copyUnit, loadWorkspace } from "../actions";
import { STATE_LABELS, isUnitInReview, unwrapContent, type ContentUnit } from "../types";
import type { ContentWorkspace } from "../data";

const GRID = "grid gap-3 sm:grid-cols-2 xl:grid-cols-3";
const ALL = "all";
const TABS = [
  { value: "active", label: "Active", match: (u: ContentUnit) => u.state !== "archived" },
  { value: "draft", label: STATE_LABELS.draft, match: (u: ContentUnit) => u.state === "draft" },
  { value: "review", label: STATE_LABELS.review, match: isUnitInReview },
  { value: "published", label: STATE_LABELS.published, match: (u: ContentUnit) => u.state === "published" },
  { value: "archived", label: STATE_LABELS.archived, match: (u: ContentUnit) => u.state === "archived" },
];

export function ContentWorkspacePage({ published = false }: { published?: boolean }) {
  return <AcademyGate>{academy => <Workspace academy={academy} published={published} />}</AcademyGate>;
}
function Workspace({ academy, published }: { academy: AcademyEntry; published: boolean }) {
  const query = useQuery({ queryKey: ["content", academy.id, "workspace"], queryFn: () => loadWorkspace(academy.id) });
  if (query.isPending) return <main role="status" aria-label="Loading content" className="page-shell"><Skeleton className="h-8 w-48" /><Skeleton className="h-9 w-full" /><div className={GRID}>{[0, 1, 2].map(k => <Skeleton key={k} className="h-40 rounded-xl" />)}</div></main>;
  if (query.isError) return <main className="page-shell"><Alert variant="destructive"><HugeiconsIcon icon={AlertCircleIcon} /><AlertTitle>Couldn’t load content</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{query.error.message}<Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? "Retrying…" : "Retry"}</Button></AlertDescription></Alert></main>;
  return <WorkspaceContent academy={academy} data={query.data} published={published} />;
}
const keyFor = (level: string, track: string | null) => `${level}/${track ?? "all"}`;
function WorkspaceContent({ academy, data, published }: { academy: AcademyEntry; data: ContentWorkspace; published: boolean }) {
  const href = useCanonicalHref(), router = useRouter();
  const defaultYear = data.years.find(y => !y.closed_at)?.id ?? data.years[0]?.id ?? "";
  const defaultTab = published ? "published" : "active";
  const [yearId, setYear] = useState(defaultYear);
  const [program, setProgram] = useState(ALL);
  const [tab, setTab] = useState(defaultTab);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"new" | "copy" | null>(null);
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
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
  const units = scoped.filter(TABS.find(t => t.value === tab)?.match ?? TABS[0].match);
  const filtered = !!search.trim() || program !== ALL || yearId !== defaultYear;
  function describe(unit: ContentUnit) {
    const p = data.programs.find(p => p.id === unit.program_id);
    const trackName = p && (data.trackYearLabels.find(label => label.track_id === p.track_id && label.academic_year_id === p.academic_year_id)?.name
      ?? data.historicalTracks.find(t => t.id === p.track_id)?.name);
    return p ? `${data.levelNames[p.level_id] ?? p.level_id}${p.track_id ? ` · ${trackName ?? "Track"}` : ""}` : "Program";
  }
  function clearFilters() { setSearch(""); setProgram(ALL); setYear(defaultYear); }
  function open(kind: "new" | "copy") { setTarget(selected?.key ?? ""); setTitle(""); setSource(""); setError(""); setRequestId(newUuid()); setModal(kind); }
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
  return <main className="page-shell min-w-0">
    <HeaderActions>
      <Button variant="outline" disabled={!writable} onClick={() => open("copy")}><HugeiconsIcon icon={Copy01Icon} aria-hidden="true" />Copy unit</Button>
      <Button disabled={!writable} onClick={() => open("new")}><HugeiconsIcon icon={Add01Icon} aria-hidden="true" />New unit</Button>
    </HeaderActions>
    <h1 className="text-2xl font-bold tracking-tight">{published ? "Published lessons" : "Content library"}</h1>
    {year?.closed_at && <Alert><HugeiconsIcon icon={AlertCircleIcon} /><AlertTitle>{yearLabel} is closed</AlertTitle><AlertDescription>Its units are read-only.</AlertDescription></Alert>}
    <Tabs value={tab} onValueChange={setTab} className="gap-5">
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <TabsList variant="line" className="min-w-0 flex-1 justify-start overflow-x-auto border-b">
          {TABS.map(t => <TabsTrigger key={t.value} value={t.value} className="flex-none">{t.label}<span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">{scoped.filter(t.match).length}</span></TabsTrigger>)}
        </TabsList>
        <div className="flex gap-2">
          <InputGroup className="sm:w-60">
            <InputGroupInput type="search" className="[&::-webkit-search-cancel-button]:appearance-none" placeholder="Search units..." aria-label="Search units" value={search} onChange={e => setSearch(e.target.value)} />
            <InputGroupAddon><HugeiconsIcon icon={Search01Icon} /></InputGroupAddon>
            {search && <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" className="text-muted-foreground hover:text-foreground" aria-label="Clear search" onClick={() => setSearch("")}><HugeiconsIcon icon={Cancel01Icon} className="size-3.5" aria-hidden="true" /></InputGroupButton></InputGroupAddon>}
          </InputGroup>
          <FilterPopover iconOnly fields={[
            { id: "year", label: "Year", value: yearId, defaultValue: defaultYear, options: data.years.map(y => ({ value: y.id, label: `${y.start_year}–${y.start_year + 1}${y.closed_at ? " · closed" : ""}` })), onChange: value => { setYear(value); setProgram(ALL); } },
            { id: "program", label: "Program", value: program, defaultValue: ALL, options: [{ value: ALL, label: "All programs" }, ...options.map(p => ({ value: p.key, label: p.label }))], onChange: setProgram },
          ]} />
        </div>
      </div>
      <TabsContent value={tab}>
        {units.length === 0
          ? <Empty className="min-h-56 rounded-xl border border-dashed bg-card/20"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={Books01Icon} aria-hidden="true" /></EmptyMedia><EmptyTitle>{filtered ? "No matching units" : "No units yet"}</EmptyTitle></EmptyHeader>{filtered && <EmptyContent><Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button></EmptyContent>}</Empty>
          : <ul className={GRID}>{units.map(u => <li key={u.id} className="min-w-0"><UnitCard unit={u} program={describe(u)} href={href(`/app/content/${u.id}`)} /></li>)}</ul>}
      </TabsContent>
    </Tabs>
    <Dialog open={modal !== null} onOpenChange={open => { if (!busy && !open) setModal(null); }}><DialogContent><DialogHeader><DialogTitle>{modal === "copy" ? "Copy a published unit" : "New unit"}</DialogTitle><DialogDescription>{yearLabel}</DialogDescription></DialogHeader>
      <FieldGroup>
        <Field><FieldLabel htmlFor="unit-program">Program</FieldLabel><Select value={target} onValueChange={setTarget} disabled={busy}><SelectTrigger id="unit-program" className="w-full"><SelectValue placeholder="Choose a program" /></SelectTrigger><SelectContent>{options.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent></Select></Field>
        {modal === "new"
          ? <Field><FieldLabel htmlFor="unit-title">Title</FieldLabel><Input id="unit-title" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} disabled={busy} /></Field>
          : <Field><FieldLabel htmlFor="unit-source">Published unit</FieldLabel><Select value={source} onValueChange={setSource} disabled={busy}><SelectTrigger id="unit-source" className="w-full"><SelectValue placeholder="Choose a published unit" /></SelectTrigger><SelectContent>{data.units.filter(u => u.state === "published").map(u => <SelectItem key={u.id} value={u.id}>{u.draft.title} · {describe(u)}</SelectItem>)}</SelectContent></Select></Field>}
      </FieldGroup>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setModal(null)}>Cancel</Button><Button disabled={busy || !target || (modal === "new" ? !title.trim() : !source)} onClick={submit}>{busy ? "Creating…" : modal === "copy" ? "Copy as draft" : "Create draft"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </main>;
}

function UnitCard({ unit, program, href }: { unit: ContentUnit; program: string; href: string }) {
  return <Link href={href} className="block h-full rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
    <Card size="sm" className={`h-full gap-0 rounded-xl px-4 py-4 transition-colors hover:border-primary/50 ${unit.state === "archived" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={unit.state === "published" ? "default" : "secondary"}>{STATE_LABELS[unit.state]}</Badge>
        {unit.review_requested_at && unit.state !== "review" && <Badge variant="outline">In review</Badge>}
        {unit.state === "published" && unit.version !== unit.published_version && <Badge variant="outline">Unpublished changes</Badge>}
      </div>
      <h3 dir="auto" className="mt-3 line-clamp-2 text-base font-semibold text-foreground">{unit.draft.title}</h3>
      <p className="truncate text-sm text-muted-foreground">{program}</p>
      {unit.draft.description && <p dir="auto" className="mt-2 line-clamp-2 text-sm text-muted-foreground">{unit.draft.description}</p>}
      <div className="mt-auto flex items-center gap-4 pt-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><HugeiconsIcon icon={FileAttachmentIcon} className="size-3.5" aria-hidden="true" />{unit.draft.items.length} materials</span>
        <span className="flex items-center gap-1.5"><HugeiconsIcon icon={Clock01Icon} className="size-3.5" aria-hidden="true" />{new Date(unit.updated_at).toLocaleDateString()}</span>
      </div>
    </Card>
  </Link>;
}
