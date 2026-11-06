import { useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkSquare02Icon, PlayIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { LearningVideo } from "../progress/player";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { openLearningMaterial } from "../access/actions";
import { unwrapContent } from "../types";

type OpenMaterial = Extract<Awaited<ReturnType<typeof openLearningMaterial>>, { ok: true }>["value"];
type MaterialProps = { academyId: string; unitId: string; itemId: string; title: string; expiresAt: string | null; resumePosition?: number };

export function StudentMaterial({ title, resumePosition = 0, ...props }: MaterialProps) {
  const [opened, setOpened] = useState(false);
  return <>
    <Button variant="outline" size="sm" onClick={() => setOpened(true)}><HugeiconsIcon icon={PlayIcon} strokeWidth={1.5} />{resumePosition > 0 ? "Resume" : "Open"}</Button>
    <Dialog open={opened} onOpenChange={setOpened}>
      <DialogContent aria-describedby={undefined} className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {opened && <StudentMaterialViewer key={JSON.stringify([props.academyId, props.unitId, props.itemId])} {...props} title={title} />}
      </DialogContent>
    </Dialog>
  </>;
}

export function StudentMaterialViewer({ academyId, unitId, itemId, title, expiresAt }: MaterialProps) {
  const [attempt, setAttempt] = useState(0), [error, setError] = useState("");
  const [material, setMaterial] = useState<OpenMaterial | null>(null);
  const load = useCallback(async () => unwrapContent(await openLearningMaterial({ academyId, unitId, itemId })), [academyId, unitId, itemId]);
  useEffect(() => {
    let stopped = false;
    void load().then(next => { if (!stopped) setMaterial(next); }).catch(e => {
      if (!stopped) setError(e instanceof Error ? e.message : "Could not open this material.");
    });
    return () => { stopped = true; };
  }, [load, attempt]);
  useEffect(() => {
    if (!material) return;
    // Earned answer videos (expiresAt null) have no grant end: playback permission keeps renewing.
    const grantEnd = expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : Infinity;
    const renew = material.kind === "video" && material.expires < grantEnd;
    const delay = Math.max(1000, material.expires * 1000 - Date.now() - (renew ? 30000 : -100));
    let stopped = false;
    const timer = setTimeout(async () => {
      if (!renew) { setMaterial(null); setError(material.kind === "document" ? "The document link expired. Refresh to open it again." : "Your playback permission expired."); return; }
      try { const next = await load(); if (!stopped) setMaterial(next); }
      catch (e) { if (!stopped) { setMaterial(null); setError(e instanceof Error ? e.message : "Could not renew playback."); } }
    }, delay);
    return () => { stopped = true; clearTimeout(timer); };
  }, [material, expiresAt, load]);
  if (error) return <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={() => { setError(""); setAttempt(n => n + 1); }}><HugeiconsIcon icon={RefreshIcon} strokeWidth={1.5} />Retry access</Button></div>;
  if (!material) return <p role="status" className="p-4 text-sm text-muted-foreground">Opening…</p>;
  return material.kind === "video"
    ? <LearningVideo academyId={academyId} unitId={unitId} itemId={itemId} title={title} playbackId={material.playbackId} tokens={{ playback: material.token, thumbnail: material.thumbnailToken, storyboard: material.storyboardToken }} />
    : <Button asChild><a href={material.url} target="_blank" rel="noopener noreferrer"><HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.5} />Open document</a></Button>;
}
