"use client";
import { useState } from "react";
import MuxPlayer from "@mux/mux-player-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkSquare02Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { previewAsset } from "../media-actions";
import { unwrapContent } from "../types";

export function MaterialPreview({ academyId, assetId, title }: { academyId: string; assetId: string; title: string }) {
  const [video, setVideo] = useState<Extract<Awaited<ReturnType<typeof previewAsset>>, { ok: true }>["value"] | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function open() {
    setBusy(true); setError("");
    try { setVideo(unwrapContent(await previewAsset(academyId, assetId))); }
    catch (e) { setError(e instanceof Error ? e.message : "Preview unavailable."); }
    finally { setBusy(false); }
  }
  return <><Button variant="outline" size="sm" disabled={busy} onClick={open}><HugeiconsIcon icon={PlayIcon} aria-hidden="true" />{busy ? "Opening…" : "Preview"}</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Dialog open={video !== null} onOpenChange={open => { if (!open) setVideo(null); }}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription className="sr-only">Staff preview</DialogDescription></DialogHeader>
      {video?.kind === "video" ? <MuxPlayer playbackId={video.playbackId} tokens={{ playback: video.token, thumbnail: video.thumbnailToken, storyboard: video.storyboardToken }} metadata={{ video_title: title }} streamType="on-demand" autoPlay={false} /> : video?.kind === "document" ? <Button asChild><a href={video.url} target="_blank" rel="noopener noreferrer"><HugeiconsIcon icon={LinkSquare02Icon} aria-hidden="true" />Open document</a></Button> : null}
    </DialogContent></Dialog>
  </>;
}
