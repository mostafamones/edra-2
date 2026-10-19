"use client";
import { newUuid } from "@/lib/uuid";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCanonicalHref } from "@/modules/navigation";
import { assessmentOptions, createAttachedAssessment } from "../actions";
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
  const options = useQuery({ queryKey: ["content", academyId, "assessments", unitId], queryFn: () => assessmentOptions(academyId, unitId), refetchOnWindowFocus: true });
  const available = options.data?.filter(a => !items.some(item => item.kind === "assessment" && item.assessmentKind === a.kind && item.assessmentId === a.id)) ?? [];
  const chosen = available.find(a => `${a.kind}:${a.id}` === selected);
  return <div className="space-y-3"><p className="text-sm font-medium">Attach an assessment</p><div className="flex flex-wrap gap-2"><Select value={chosen ? selected : ""} onValueChange={setSelected} disabled={disabled || options.isPending || options.isError || !available.length}><SelectTrigger className="min-w-0 flex-1" aria-label="Assessment"><SelectValue placeholder={options.isPending ? "Loading assessments…" : available.length ? "Choose an existing assessment" : "No compatible assessments"} /></SelectTrigger><SelectContent>{available.map(a => <SelectItem key={`${a.kind}:${a.id}`} value={`${a.kind}:${a.id}`}>{a.kind} · {a.title}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={disabled || !chosen} onClick={() => { if (chosen) onAdd({ id: newUuid(), kind: "assessment", title: chosen.title, assessmentKind: chosen.kind, assessmentId: chosen.id }); setSelected(""); }}>Attach</Button></div>
    {options.isError && <p role="alert" className="text-sm text-destructive">Could not load assessments. <button className="underline" onClick={() => options.refetch()}>Retry</button></p>}
    <p className="text-xs text-muted-foreground">Only assessments that fit this program and academic year and are not already attached to a unit are listed. You can also create an assessment directly in this unit.</p>
    <div className="flex flex-wrap gap-2">{(["assignment", "quiz", "exam"] as const).map(k => <Button key={k} variant="outline" size="sm" disabled={disabled || dirty} onClick={() => { setKind(k); setTitle(""); setError(""); }}>Create {k}</Button>)}<Button size="sm" variant="ghost" onClick={() => options.refetch()} disabled={disabled}>Refresh list</Button></div>
    {dirty && <p className="text-xs text-muted-foreground">Save the unit before creating a new assessment.</p>}
    <Dialog open={kind !== null} onOpenChange={open => { if (!busy && !open) setKind(null); }}><DialogContent><DialogHeader><DialogTitle>Create {kind}</DialogTitle><DialogDescription>The new assessment inherits this unit’s program and academic year. It is attached automatically; finish its questions in the assessment editor.</DialogDescription></DialogHeader><Input value={title} aria-label="Assessment title" maxLength={200} onChange={e => setTitle(e.target.value)} disabled={busy} />{error && <p role="alert" className="text-destructive text-sm">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setKind(null)}>Cancel</Button><Button disabled={busy || !title.trim()} onClick={create}>Create and edit</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
