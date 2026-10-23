"use client";
import { useEffect, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";
import { IconExternalLink, IconPlayerPlay, IconRefresh } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { openLearningMaterial } from "../access/actions";
import { unwrapContent } from "../types";

type OpenMaterial = Extract<Awaited<ReturnType<typeof openLearningMaterial>>, { ok: true }>["value"];
export function StudentMaterial({ academyId, unitId, itemId, title, expiresAt }: { academyId: string; unitId: string; itemId: string; title: string; expiresAt: string | null }) {
  const [opened, setOpened] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [material, setMaterial] = useState<OpenMaterial | null>(null);
  async function open() {
    setBusy(true); setError("");
    try { setMaterial(unwrapContent(await openLearningMaterial({ academyId, unitId, itemId }))); setOpened(true); }
    catch (e) { setMaterial(null); setError(e instanceof Error ? e.message : "Could not open this material."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!opened || !material) return;
    // Earned answer videos (expiresAt null) have no grant end: playback permission keeps renewing.
    const grantEnd = expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : Infinity;
    const renew = material.kind === "video" && material.expires < grantEnd;
    const delay = Math.max(1000, material.expires * 1000 - Date.now() - (renew ? 30000 : -100));
    let stopped = false;
    const timer = setTimeout(async () => {
      if (!renew) { setMaterial(null); setError(material.kind === "document" ? "The document link expired. Refresh to open it again." : "Your playback permission expired."); return; }
      try { const next = unwrapContent(await openLearningMaterial({ academyId, unitId, itemId })); if (!stopped) setMaterial(next); }
      catch (e) { if (!stopped) { setMaterial(null); setError(e instanceof Error ? e.message : "Could not renew playback."); } }
    }, delay);
    return () => { stopped = true; clearTimeout(timer); };
  }, [opened, material, academyId, unitId, itemId, expiresAt]);
  return <><Button variant="outline" size="sm" disabled={busy} onClick={open}><IconPlayerPlay />{busy ? "Opening…" : "Open"}</Button>{!opened && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Dialog open={opened} onOpenChange={value => { setOpened(value); if (!value) { setMaterial(null); setError(""); } }}><DialogContent aria-describedby={undefined} className="sm:max-w-3xl"><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {material?.kind === "video" ? <MuxPlayer playbackId={material.playbackId} tokens={{ playback: material.token, thumbnail: material.thumbnailToken, storyboard: material.storyboardToken }} metadata={{ video_title: title }} streamType="on-demand" autoPlay={false} /> : material?.kind === "document" ? <Button asChild><a href={material.url} target="_blank" rel="noopener noreferrer"><IconExternalLink />Open document</a></Button> : null}
      <Button variant="outline" disabled={busy} onClick={open}><IconRefresh />Refresh access</Button>
    </DialogContent></Dialog>
  </>;
}
