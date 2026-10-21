"use client";
import { newUuid } from "@/lib/uuid";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { IconBooks, IconCopy, IconPlus, IconSearch } from "@tabler/icons-react";
import { AcademyGate } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { useCanonicalHref } from "@/modules/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Field, FieldLabel } from "@/components/ui/field";
import { createUnit, copyUnit, loadWorkspace } from "../actions";
import { STATE_LABELS, isUnitInReview, unwrapContent, type ContentUnit } from "../types";
import type { ContentWorkspace } from "../data";

export function ContentWorkspacePage({ published = false }: { published?: boolean }) {
  return <AcademyGate>{academy => <Workspace academy={academy} published={published} />}</AcademyGate>;
}
function Workspace({ academy, published }: { academy: AcademyEntry; published: boolean }) {
  const query = useQuery({ queryKey: ["content", academy.id, "workspace"], queryFn: () => loadWorkspace(academy.id) });
  if (query.isPending) return <main className="page-shell"><Skeleton className="h-12 w-64" /><Skeleton className="h-64" /></main>;
  if (query.isError) return <main className="page-shell"><Alert variant="destructive"><AlertTitle>Couldn’t load content</AlertTitle><AlertDescription>{query.error.message}</AlertDescription></Alert><Button onClick={() => query.refetch()}>Try again</Button></main>;
  return <WorkspaceContent academy={academy} data={query.data} published={published} />;
}
const keyFor = (level: string, track: string | null) => `${level}/${track ?? "all"}`;
function WorkspaceContent({ academy, data, published }: { academy: AcademyEntry; data: ContentWorkspace; published: boolean }) {
  const href = useCanonicalHref(), router = useRouter();
  const [yearId, setYear] = useState(data.years.find(y => !y.closed_at)?.id ?? data.years[0]?.id ?? "");
  const [program, setProgram] = useState("");
  const [state, setState] = useState(published ? "published" : "active");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"new" | "copy" | null>(null);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  const year = data.years.find(y => y.id === yearId);
  const options = data.levels.flatMap(l => [
    { key: keyFor(l.level_id, null), level: l.level_id, track: null as string | null, label: data.levelNames[l.level_id] ?? l.level_id },
    ...data.tracks.filter(t => t.level_id === l.level_id).map(t => ({ key: keyFor(l.level_id, t.id), level: l.level_id, track: t.id, label: `${data.levelNames[l.level_id] ?? l.level_id} · ${t.name}` })),
  ]);
  const selected = options.find(p => p.key === program);
  const programIds = new Set(data.programs.filter(p => p.academic_year_id === yearId && (!selected || (p.level_id === selected.level && p.track_id === selected.track))).map(p => p.id));
  const units = data.units.filter(u => programIds.has(u.program_id) && (state === "all" || (state === "active" ? u.state !== "archived" : state === "review" ? isUnitInReview(u) : u.state === state)) && `${u.draft.title} ${u.draft.description}`.toLowerCase().includes(search.toLowerCase()));
  function describe(unit: ContentUnit) {
    const p = data.programs.find(p => p.id === unit.program_id);
    const trackName = p && (data.trackYearLabels.find(label => label.track_id === p.track_id && label.academic_year_id === p.academic_year_id)?.name
      ?? data.historicalTracks.find(t => t.id === p.track_id)?.name);
    return p ? `${data.levelNames[p.level_id] ?? p.level_id}${p.track_id ? ` · ${trackName ?? "Track"}` : ""}` : "Program";
  }
  function open(kind: "new" | "copy") { setTitle(""); setSource(""); setError(""); setRequestId(newUuid()); setModal(kind); }
  async function submit() {
    if (!selected || !year || year.closed_at) return;
    setBusy(true); setError("");
    try {
      const scope = { academyId: academy.id, yearId, levelId: selected.level, trackId: selected.track, unitId: requestId };
      const id = unwrapContent(modal === "copy" ? await copyUnit({ ...scope, sourceId: source }) : await createUnit({ ...scope, title }));
      router.push(href(`/app/content/${id}`));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create the unit. Retry with the same action."); setBusy(false); }
  }
  return <main className="page-shell">
    <div><h1 className="font-heading text-2xl font-bold tracking-tight">{published ? "Published lessons" : "Content library"}</h1><p className="text-sm text-muted-foreground">Choose a program to prepare its units. Published material can be copied into another program.</p></div>
    <div className="grid gap-3 md:grid-cols-[12rem_1fr]">
      <Select value={yearId} onValueChange={value => { setYear(value); setProgram(""); }}><SelectTrigger className="w-full" aria-label="Academic year"><SelectValue placeholder="Academic year" /></SelectTrigger><SelectContent>{data.years.map(y => <SelectItem key={y.id} value={y.id}>{y.start_year}–{y.start_year + 1}{y.closed_at ? " · closed" : " · active"}</SelectItem>)}</SelectContent></Select>
      <Select value={program || "all"} onValueChange={v => setProgram(v === "all" ? "" : v)}><SelectTrigger className="w-full" aria-label="Program"><SelectValue placeholder="Choose a program" /></SelectTrigger><SelectContent><SelectItem value="all">All programs</SelectItem>{options.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent></Select>
    </div>
    {year?.closed_at && <Alert><AlertTitle>Academic history</AlertTitle><AlertDescription>This year is closed. Its units are read-only. Select an active-year program to create or copy material.</AlertDescription></Alert>}
    <div className="flex flex-wrap items-center gap-2">
      <IconSearch className="size-4 text-muted-foreground" /><Input className="max-w-xs" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search units" aria-label="Search units" />
      <Select value={state} onValueChange={setState}><SelectTrigger aria-label="Unit status" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">All but archived</SelectItem><SelectItem value="all">All statuses</SelectItem>{Object.entries(STATE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
      <div className="ml-auto flex gap-2"><Button variant="outline" disabled={!selected || !year || !!year.closed_at} onClick={() => open("copy")}><IconCopy />Copy published unit</Button><Button disabled={!selected || !year || !!year.closed_at} onClick={() => open("new")}><IconPlus />New unit</Button></div>
    </div>
    {!selected && <p className="text-sm text-muted-foreground">Choose a program above to create or copy a unit. Year, grade and track belong to that program.</p>}
    {units.length === 0 ? <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><IconBooks /></EmptyMedia><EmptyTitle>{search || state === "review" ? "No matching units" : "No units yet"}</EmptyTitle><EmptyDescription>{search ? "Try another search or clear your filters." : "New academic years start empty. Choose a program, then create a unit or copy published material."}</EmptyDescription></EmptyHeader></Empty> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{units.map(u => <Link key={u.id} href={href(`/app/content/${u.id}`)}><Card className="h-full transition-colors hover:border-primary/50"><CardHeader><div className="flex items-center justify-between gap-2"><Badge variant="secondary">{STATE_LABELS[u.state]}</Badge>{u.review_requested_at && u.state !== "review" && <Badge variant="outline">In review</Badge>}{u.state === "published" && u.version !== u.published_version && <span className="text-xs text-muted-foreground">Unpublished changes</span>}</div><CardTitle className="line-clamp-2">{u.draft.title}</CardTitle><CardDescription>{describe(u)}</CardDescription></CardHeader><CardContent><p className="line-clamp-2 text-sm text-muted-foreground">{u.draft.description || "No description"}</p><p className="mt-4 text-xs text-muted-foreground">{u.draft.items.length} materials · Updated {new Date(u.updated_at).toLocaleDateString()}</p></CardContent></Card></Link>)}</div>}
    <Dialog open={modal !== null} onOpenChange={open => { if (!busy && !open) setModal(null); }}><DialogContent><DialogHeader><DialogTitle>{modal === "copy" ? "Copy a published unit" : "Create a unit"}</DialogTitle><DialogDescription>{selected?.label} · {year?.start_year}–{(year?.start_year ?? 0) + 1}. {modal === "copy" ? "Everything is copied as a draft. Dates and student activity are not copied." : "You can save it before adding learning material."}</DialogDescription></DialogHeader>
      {modal === "new" ? <Field><FieldLabel htmlFor="unit-title">Title</FieldLabel><Input id="unit-title" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} autoFocus disabled={busy} /></Field> : <Field><FieldLabel>Published source</FieldLabel><Select value={source} onValueChange={setSource} disabled={busy}><SelectTrigger className="w-full"><SelectValue placeholder="Choose a published unit" /></SelectTrigger><SelectContent>{data.units.filter(u => u.state === "published").map(u => <SelectItem key={u.id} value={u.id}>{u.draft.title} · {describe(u)}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Only the published version is copied; pending edits remain private.</p></Field>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setModal(null)}>Cancel</Button><Button disabled={busy || (modal === "new" ? !title.trim() : !source)} onClick={submit}>{busy ? "Creating…" : modal === "copy" ? "Copy as draft" : "Create draft"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </main>;
}
