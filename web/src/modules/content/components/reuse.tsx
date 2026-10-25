"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon } from "@hugeicons/core-free-icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { reuseMaterial } from "../actions";
import { unitPanelOptions } from "../panels";
import { KIND_LABELS, unwrapContent } from "../types";

export function ReuseMaterial({ academyId, unitId, version, disabled, onChange }: { academyId: string; unitId: string; version: number; disabled: boolean; onChange: () => Promise<void> }) {
  const [open, setOpen] = useState(false), [source, setSource] = useState(""), [item, setItem] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const sources = useQuery({ ...unitPanelOptions(academyId, unitId), enabled: open, select: panels => unwrapContent(panels.sources) });
  const material = sources.data?.find(unit => unit.id === source)?.items ?? [];
  async function copy() {
    setBusy(true); setError("");
    try { unwrapContent(await reuseMaterial({ academyId, unitId, version, sourceId: source, itemId: item })); await onChange(); setOpen(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not reuse material."); }
    finally { setBusy(false); }
  }
  return <><Button variant="outline" size="sm" disabled={disabled} onClick={() => { setSource(""); setItem(""); setError(""); setOpen(true); }}><HugeiconsIcon icon={Copy01Icon} strokeWidth={1.5} aria-hidden="true" />Reuse material</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent><DialogHeader><DialogTitle>Reuse material</DialogTitle><DialogDescription className="sr-only">Copy material from a published unit.</DialogDescription></DialogHeader>
      <FieldGroup className="gap-4"><Field><FieldLabel htmlFor="reuse-source">Published unit</FieldLabel><Select value={source} onValueChange={v => { setSource(v); setItem(""); }} disabled={busy || sources.isPending || sources.isError}><SelectTrigger id="reuse-source" className="w-full"><SelectValue placeholder={sources.isPending ? "Loading published units…" : sources.data?.length ? "Choose a published unit" : "No published units"} /></SelectTrigger><SelectContent>{sources.data?.map(u => <SelectItem key={u.id} value={u.id}>{u.title}</SelectItem>)}</SelectContent></Select></Field>
      <Field><FieldLabel htmlFor="reuse-item">Material</FieldLabel><Select value={item} onValueChange={setItem} disabled={busy || !source || sources.isPending || sources.isError}><SelectTrigger id="reuse-item" className="w-full"><SelectValue placeholder="Choose material to copy" /></SelectTrigger><SelectContent>{material.map(i => <SelectItem key={i.id} value={i.id}>{KIND_LABELS[i.kind]} · {i.title}</SelectItem>)}</SelectContent></Select></Field></FieldGroup>
      {sources.isError && <div role="alert" className="flex items-center gap-2 text-sm text-destructive">Could not load published sources.<Button variant="outline" size="sm" disabled={sources.isFetching} onClick={() => void sources.refetch()}>Retry</Button></div>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy || !source || !item || sources.isError} onClick={copy}>{busy ? "Copying…" : "Copy material"}</Button></DialogFooter>
    </DialogContent></Dialog></>;
}
