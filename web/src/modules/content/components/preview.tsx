import { useState } from "react";
import { YoutubePlayer } from "../youtube-player";
import MuxPlayer from "@mux/mux-player-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkSquare02Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { previewAsset } from "../media-actions";
import { unwrapContent } from "../types";
import { PlaceholderVideo } from "./placeholder";

/** The muted ghost style shared by material row actions. */
export const ACTION = "text-foreground/70 hover:text-foreground";

/** Plays a video in a dialog; a document opens straight in a new tab. */
export function MaterialPreview({ academyId, assetId, title, document, startSeconds, label }: { academyId: string; assetId: string; title: string; document?: boolean; startSeconds?: number; label?: string }) {
  const [video, setVideo] = useState<Extract<Awaited<ReturnType<typeof previewAsset>>, { ok: true }>["value"] | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function open() {
    // Opened during the click so popup blockers allow it; the signed URL arrives after.
    const tab = document ? window.open("", "_blank") : null;
    if (tab) tab.opener = null;
    setBusy(true); setError("");
    try {
      const preview = unwrapContent(await previewAsset(academyId, assetId));
      if (preview.kind === "document" && tab) tab.location.href = preview.url; else setVideo(preview);
    }
    catch (e) { tab?.close(); setError(e instanceof Error ? e.message : "Preview unavailable."); }
    finally { setBusy(false); }
  }
  return <><Button variant="ghost" size="sm" className={ACTION} disabled={busy} aria-label={label ? `Play ${title} at ${label}` : undefined} onClick={open}><HugeiconsIcon icon={document ? LinkSquare02Icon : PlayIcon} strokeWidth={1.5} aria-hidden="true" />{busy ? "Opening…" : label ?? (document ? "Open" : "Preview")}</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Dialog open={video !== null} onOpenChange={open => { if (!open) setVideo(null); }}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription className="sr-only">Staff preview</DialogDescription></DialogHeader>
      {video?.kind === "placeholder" ? <PlaceholderVideo title={title} /> : video?.kind === "video" ? <MuxPlayer playbackId={video.playbackId} tokens={{ playback: video.token, thumbnail: video.thumbnailToken, storyboard: video.storyboardToken }} metadata={{ video_title: title }} streamType="on-demand" autoPlay={false} startTime={startSeconds} className="block max-h-[70dvh]" /> : video?.kind === "youtube" ? <YoutubePlayer id={video.youtubeId} title={title} start={startSeconds} /> : video?.kind === "document" ? <Button asChild><a href={video.url} target="_blank" rel="noopener noreferrer"><HugeiconsIcon icon={LinkSquare02Icon} aria-hidden="true" />Open document</a></Button> : null}
    </DialogContent></Dialog>
  </>;
}
