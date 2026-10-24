"use client";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, File02Icon, RefreshIcon, Video01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { newUuid } from "@/lib/uuid";
import type { ContentDetail } from "../data";
import { finishDocument, refreshVideo } from "../media-actions";
import { unattachedUploads, unwrapContent, type ContentItem } from "../types";
import { MaterialPreview } from "./preview";
import { DeleteVideo } from "./delete-video";

type Asset = ContentDetail["assets"][number];
type UploadProps = { academyId: string; asset: Asset; items: ContentItem[]; disabled: boolean; dirty: boolean; onAdd: (item: ContentItem) => void; onRefresh: () => Promise<void> };

/** Registration survives navigation independently of the unit's saved document. */
export function UploadedFiles({ academyId, unitId, assets, items, disabled, dirty, onAdd, onRefresh }: Omit<UploadProps, "asset"> & { unitId: string; assets: Asset[] }) {
  const pending = unattachedUploads(assets, unitId, items);
  if (!pending.length) return null;
  return <section aria-labelledby="uploaded-files-title" className="space-y-2">
    <h2 id="uploaded-files-title" className="px-2 text-base font-semibold text-foreground/80">Unattached uploads<span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">{pending.length}</span></h2>
    <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-dashed bg-card/40">{pending.map(asset => <UploadRow key={asset.id} academyId={academyId} asset={asset} items={items} disabled={disabled} dirty={dirty} onAdd={onAdd} onRefresh={onRefresh} />)}</ul>
  </section>;
}

function UploadRow({ academyId, asset, items, disabled, dirty, onAdd, onRefresh }: UploadProps) {
  const [kind, setKind] = useState<"explanation" | "answer">("explanation");
  const [assessmentId, setAssessment] = useState("");
  const [checking, setChecking] = useState(false), [error, setError] = useState("");
  const assessment = items.find(item => item.kind === "assessment" && item.id === assessmentId);
  const usable = !asset.deletion_token && (asset.status === "ready" || asset.status === "processing");
  async function check() {
    setChecking(true); setError("");
    try {
      if (asset.kind === "video") unwrapContent(await refreshVideo(academyId, asset.id));
      else unwrapContent(await finishDocument(academyId, asset.id));
      await onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not check this upload."); }
    finally { setChecking(false); }
  }
  function attach() {
    if (!usable || (asset.kind === "video" && kind === "answer" && !assessment)) return;
    onAdd({ id: newUuid(), kind: asset.kind === "document" ? "document" : kind, title: asset.name, assetId: asset.id,
      ...(asset.kind === "video" && kind === "answer" && assessment ? { assessmentId: assessment.assessmentId, assessmentKind: assessment.assessmentKind } : {}) });
  }
  const status = asset.deletion_token ? "Deletion pending" : asset.status === "failed" ? "Failed, upload again" : asset.status === "uploading" ? "Uploading" : asset.status === "processing" ? "Processing" : null;
  return <li className="space-y-3 px-4 py-3">
    <div className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><HugeiconsIcon icon={asset.kind === "video" ? Video01Icon : File02Icon} className="size-4.5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={asset.name}>{asset.name}</p>
        <p className="text-xs text-muted-foreground">{new Date(asset.created_at).toLocaleString()}{status && <> · <span className={asset.status === "failed" ? "text-destructive" : undefined}>{status}</span></>}</p></div>
    </div>
    {asset.kind === "video" && <div className="flex flex-col gap-2 sm:flex-row">
      <Select value={kind} disabled={disabled || checking} onValueChange={value => setKind(value as typeof kind)}><SelectTrigger aria-label={`Use ${asset.name} as`} className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="explanation">Explanation video</SelectItem><SelectItem value="answer">Answer video</SelectItem></SelectContent></Select>
      {kind === "answer" && <Select value={assessmentId} onValueChange={setAssessment} disabled={disabled || checking}><SelectTrigger aria-label={`Assessment for ${asset.name}`} className="w-full min-w-0 sm:flex-1"><SelectValue placeholder="Choose an attached assessment" /></SelectTrigger><SelectContent>{items.filter(item => item.kind === "assessment").map(item => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent></Select>}
    </div>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={disabled || checking || !usable || (asset.kind === "video" && kind === "answer" && !assessment)} onClick={attach}><HugeiconsIcon icon={Add01Icon} aria-hidden="true" />Add to unit</Button>
      {asset.status === "ready" && !asset.deletion_token && <MaterialPreview academyId={academyId} assetId={asset.id} title={asset.name} />}
      {asset.status !== "ready" && !asset.deletion_token && <Button variant="outline" size="sm" disabled={disabled || checking} onClick={check}><HugeiconsIcon icon={RefreshIcon} aria-hidden="true" />{checking ? "Checking…" : "Check upload"}</Button>}
      {asset.kind === "video" && <DeleteVideo academyId={academyId} assetId={asset.id} name={asset.name} disabled={disabled || checking || dirty} pending={!!asset.deletion_token} onDeleted={onRefresh} />}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </li>;
}
