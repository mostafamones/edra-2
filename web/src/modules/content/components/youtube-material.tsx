import { useState } from "react";
import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { newUuid } from "@/lib/uuid";
import { formatVideoDuration, maxYoutubeDuration, youtubeIdFromUrl } from "../youtube";
import { YoutubePlayer } from "../youtube-player";
import { registerYoutube } from "../youtube-actions";
import { unwrapContent, type ContentItem } from "../types";
import { TILE, TileIcon } from "./uploader";

export function YoutubeMaterial({ academyId, unitId, disabled, onAdded }: { academyId: string; unitId: string; disabled: boolean; onAdded: (item: ContentItem) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
    <DialogTrigger asChild><Button type="button" variant="ghost" className={`${TILE} h-auto justify-start font-normal`} disabled={disabled}>
      <TileIcon icon={LinkSquare02Icon} /><span className="text-sm font-medium">Add YouTube video</span>
    </Button></DialogTrigger>
    <DialogContent aria-describedby={undefined} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Add YouTube video</DialogTitle></DialogHeader>
      {open && <YoutubeForm academyId={academyId} unitId={unitId} busy={busy} setBusy={setBusy} disabled={disabled} onAdded={async item => { await onAdded(item); setOpen(false); }} />}
    </DialogContent>
  </Dialog>;
}

function YoutubeForm({ academyId, unitId, busy, disabled, setBusy, onAdded }: { academyId: string; unitId: string; busy: boolean; disabled: boolean; setBusy: (busy: boolean) => void; onAdded: (item: ContentItem) => Promise<void> }) {
  const [url, setUrl] = useState(""), [title, setTitle] = useState(""), [preview, setPreview] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(), [error, setError] = useState("");
  const [assetId, setAssetId] = useState(newUuid);
  const id = youtubeIdFromUrl(url);
  async function attach() {
    if (busy || disabled || !id || !title.trim()) return;
    setBusy(true); setError("");
    try {
      unwrapContent(await registerYoutube({ academyId, unitId, assetId, url, title: title.trim(), duration }));
      await onAdded({ id: newUuid(), kind: "explanation", title: title.trim(), assetId });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add the video."); }
    finally { setBusy(false); }
  }
  return <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void attach(); }}>
    <label className="grid gap-2 text-sm font-medium">YouTube link<Input type="url" value={url} required maxLength={2048} disabled={busy} onChange={e => { setUrl(e.target.value); if (youtubeIdFromUrl(e.target.value) !== id) { setPreview(null); setDuration(undefined); setAssetId(newUuid()); } setError(""); }} /></label>
    {!!url && !id && <p role="status" className="text-sm text-destructive">Enter a YouTube video link.</p>}
    <label className="grid gap-2 text-sm font-medium">Title<Input value={title} required maxLength={250} dir="auto" disabled={busy} onChange={e => setTitle(e.target.value)} /></label>
    {preview && preview === id && <div className="overflow-hidden rounded-lg border"><YoutubePlayer key={preview} id={preview} title="YouTube preview" onDuration={seconds => {
      if (seconds <= maxYoutubeDuration) setDuration(seconds);
    }} /></div>}
    {duration ? <p className="text-sm text-muted-foreground" role="status">Duration: {formatVideoDuration(duration)}</p>
      : preview && <p className="text-sm text-muted-foreground" role="status">Play the preview to detect duration. Without duration, Edra records opens only.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter>
      <Button type="button" variant="outline" disabled={!id || busy || preview === id} onClick={() => setPreview(id)}>Preview</Button>
      <Button disabled={!id || !title.trim() || busy || disabled}>{busy ? "Adding…" : "Add video"}</Button>
    </DialogFooter>
  </form>;
}
