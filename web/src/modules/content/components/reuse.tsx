"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { loadWorkspace, loadUnit, reuseMaterial } from "../actions";
import { documentSchema, KIND_LABELS, unwrapContent } from "../types";

export function ReuseMaterial({ academyId, unitId, version, disabled, onChange }: { academyId: string; unitId: string; version: number; disabled: boolean; onChange: () => Promise<void> }) {
  const [open, setOpen] = useState(false), [source, setSource] = useState(""), [item, setItem] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const workspace = useQuery({ queryKey: ["content", academyId, "workspace"], queryFn: () => loadWorkspace(academyId), enabled: open });
  const detail = useQuery({ queryKey: ["content", academyId, "reuse-source", source], queryFn: () => loadUnit(academyId, source), enabled: open && !!source });
  const published = detail.data?.revisions[0]?.document;
  const material = published ? documentSchema.parse(published).items : [];
  async function copy() {
    setBusy(true); setError("");
    try { unwrapContent(await reuseMaterial({ academyId, unitId, version, sourceId: source, itemId: item })); await onChange(); setOpen(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not reuse material."); }
    finally { setBusy(false); }
  }
  return <><Button variant="outline" disabled={disabled} onClick={() => { setSource(""); setItem(""); setError(""); setOpen(true); }}>Reuse published material</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent><DialogHeader><DialogTitle>Reuse material</DialogTitle><DialogDescription>Copy from a published unit in this academy. Copying an answer video includes a fresh copy of its assessment.</DialogDescription></DialogHeader>
      <Select value={source} onValueChange={v => { setSource(v); setItem(""); }} disabled={busy}><SelectTrigger className="w-full" aria-label="Source unit"><SelectValue placeholder="Choose a published source" /></SelectTrigger><SelectContent>{workspace.data?.units.filter(u => u.state === "published" && u.id !== unitId).map(u => <SelectItem key={u.id} value={u.id}>{u.draft.title}</SelectItem>)}</SelectContent></Select>
      <Select value={item} onValueChange={setItem} disabled={busy || detail.isPending}><SelectTrigger className="w-full" aria-label="Source material"><SelectValue placeholder="Choose material to copy" /></SelectTrigger><SelectContent>{material.map(i => <SelectItem key={i.id} value={i.id}>{KIND_LABELS[i.kind]} · {i.title}</SelectItem>)}</SelectContent></Select>
      {(workspace.isError || detail.isError) && <p role="alert" className="text-sm text-destructive">Could not load published sources.</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy || !source || !item} onClick={copy}>{busy ? "Copying…" : "Copy material"}</Button></DialogFooter>
    </DialogContent></Dialog></>;
}
