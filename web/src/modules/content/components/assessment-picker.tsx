"use client";
import { newUuid } from "@/lib/uuid";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowDown01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { useCanonicalHref } from "@/modules/navigation";
import { createAttachedAssessment } from "../actions";
import { unitPanelOptions } from "../panels";
import { unwrapContent, type ContentItem } from "../types";

export function AssessmentPicker({ academyId, unitId, items, version, dirty, disabled, onAdd, onCreated }: { academyId: string; unitId: string; items: ContentItem[]; version: number; dirty: boolean; disabled: boolean; onAdd: (item: ContentItem) => void; onCreated: () => Promise<void> }) {
  const href = useCanonicalHref(), router = useRouter(), [selected, setSelected] = useState("");
  const [kind, setKind] = useState<"assignment" | "quiz" | "exam" | null>(null), [title, setTitle] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function create() {
    if (!kind) return;
    setBusy(true); setError("");
    try {
      const id = unwrapContent(await createAttachedAssessment({ academyId, unitId, version, kind, title }));
      await onCreated();
      router.push(href(`/app/${kind === "quiz" ? "quizzes" : kind === "exam" ? "exams" : "assignments"}/${id}/edit`));
    } catch(e) { setError(e instanceof Error ? e.message : "Could not create assessment."); setBusy(false); }
  }
  const options = useQuery({ ...unitPanelOptions(academyId, unitId), select: panels => unwrapContent(panels.assessments), refetchOnWindowFocus: true });
  const available = options.data?.filter(a => !items.some(item => item.kind === "assessment" && item.assessmentKind === a.kind && item.assessmentId === a.id)) ?? [];
  const chosen = available.find(a => `${a.kind}:${a.id}` === selected);
  const LABELS = { assignment: "Assignment", quiz: "Quiz", exam: "Exam" };
  return <div className="space-y-3">
    <div className="flex gap-2">
      <Select value={chosen ? selected : ""} onValueChange={setSelected} disabled={disabled || options.isPending || options.isError || !available.length}><SelectTrigger className="min-w-0 flex-1" aria-label="Assessment"><SelectValue placeholder={options.isPending ? "Loading assessments…" : available.length ? "Choose an existing assessment" : "No compatible assessments"} /></SelectTrigger><SelectContent>{available.map(a => <SelectItem key={`${a.kind}:${a.id}`} value={`${a.kind}:${a.id}`}>{LABELS[a.kind]} · {a.title}</SelectItem>)}</SelectContent></Select>
      <Button variant="ghost" size="icon" aria-label="Refresh assessments" disabled={disabled || options.isFetching} onClick={() => options.refetch()}><HugeiconsIcon icon={RefreshIcon} /></Button>
      <Button disabled={disabled || !chosen} onClick={() => { if (chosen) onAdd({ id: newUuid(), kind: "assessment", title: chosen.title, assessmentKind: chosen.kind, assessmentId: chosen.id }); setSelected(""); }}>Attach</Button>
    </div>
    {options.isError && <p role="alert" className="text-sm text-destructive">Could not load assessments. <button className="underline" onClick={() => options.refetch()}>Retry</button></p>}
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={disabled || dirty}><HugeiconsIcon icon={Add01Icon} aria-hidden="true" />Create new<HugeiconsIcon icon={ArrowDown01Icon} aria-hidden="true" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-fit">{(["assignment", "quiz", "exam"] as const).map(k => <DropdownMenuItem key={k} onSelect={() => { setKind(k); setTitle(""); setError(""); }}>{LABELS[k]}</DropdownMenuItem>)}</DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={kind !== null} onOpenChange={open => { if (!busy && !open) setKind(null); }}><DialogContent><DialogHeader><DialogTitle>New {kind && LABELS[kind].toLowerCase()}</DialogTitle><DialogDescription className="sr-only">Create an assessment attached to this unit.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="assessment-title">Title</FieldLabel><Input id="assessment-title" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} disabled={busy} /></Field>{error && <p role="alert" className="text-destructive text-sm">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setKind(null)}>Cancel</Button><Button disabled={busy || !title.trim()} onClick={create}>{busy ? "Creating…" : "Create and edit"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
