"use client";
import { useState } from "react";
import { IconPlus, IconRefresh } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  return <section aria-labelledby="uploaded-files-title" className="space-y-3 rounded-lg border p-4">
    <div><h3 id="uploaded-files-title" className="font-medium">Uploaded files</h3><p className="text-sm text-muted-foreground">These files are kept even if you leave without saving. Add one to the unit, then save the draft. No new upload is needed.</p></div>
    {dirty && <p className="text-xs text-muted-foreground">Save draft changes before permanently deleting a video.</p>}
    <ul className="space-y-3">{pending.map(asset => <UploadRow key={asset.id} academyId={academyId} asset={asset} items={items} disabled={disabled} dirty={dirty} onAdd={onAdd} onRefresh={onRefresh} />)}</ul>
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
  return <li className="space-y-2 rounded-md border p-3">
    <div className="flex flex-wrap items-center gap-2"><span className="min-w-0 break-all text-sm font-medium">{asset.name}</span><Badge variant="secondary">{asset.deletion_token ? "Deletion pending" : asset.status}</Badge></div>
    <p className="text-xs text-muted-foreground">Uploaded {new Date(asset.created_at).toLocaleString()}</p>
    {asset.kind === "video" && <Select value={kind} disabled={disabled || checking} onValueChange={value => setKind(value as typeof kind)}><SelectTrigger aria-label={`Use ${asset.name} as`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="explanation">Explanation video</SelectItem><SelectItem value="answer">Assessment answer video</SelectItem></SelectContent></Select>}
    {asset.kind === "video" && kind === "answer" && <Select value={assessmentId} onValueChange={setAssessment} disabled={disabled || checking}><SelectTrigger aria-label={`Assessment for ${asset.name}`} className="w-full"><SelectValue placeholder="Choose an attached assessment" /></SelectTrigger><SelectContent>{items.filter(item => item.kind === "assessment").map(item => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent></Select>}
    <div className="flex flex-wrap gap-2">{asset.status === "ready" && !asset.deletion_token && <MaterialPreview academyId={academyId} assetId={asset.id} title={asset.name} />}
      <Button variant="outline" size="sm" disabled={disabled || checking || !usable || (asset.kind === "video" && kind === "answer" && !assessment)} onClick={attach}><IconPlus />Add to unit</Button>
      {asset.status !== "ready" && !asset.deletion_token && <Button variant="ghost" size="sm" disabled={disabled || checking} onClick={check}><IconRefresh />{checking ? "Checking…" : "Check upload"}</Button>}
      {asset.kind === "video" && <DeleteVideo academyId={academyId} assetId={asset.id} name={asset.name} disabled={disabled || checking || dirty} pending={!!asset.deletion_token} onDeleted={onRefresh} />}
    </div>
    {asset.status === "uploading" && <p className="text-xs text-muted-foreground">Waiting for the upload to finish. Check its status before choosing the file again.</p>}
    {asset.status === "failed" && <p className="text-xs text-destructive">This upload failed. Choose the file again to retry.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </li>;
}
