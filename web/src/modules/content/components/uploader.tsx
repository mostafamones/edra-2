"use client";
import { newUuid } from "@/lib/uuid";
import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { RefreshIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import { beginUpload, finishDocument } from "../media-actions";
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, unwrapContent, type ContentItem } from "../types";

type Pending = { file: File; id: string; parent?: ContentItem };
export type MaterialUpload = ReturnType<typeof useMaterialUpload>;
export const isVideo = (file: File) => file.type.startsWith("video/");

/** One upload at a time: a video becomes an explanation and anything else a document; `parent` is where it was dropped. */
export function useMaterialUpload({ academyId, unitId, onUploaded }: { academyId: string; unitId: string; onUploaded: (item: ContentItem, parent?: ContentItem) => void }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState("");
  const xhr = useRef<XMLHttpRequest | null>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; xhr.current?.abort(); }; }, []);
  async function upload({ file, id, parent }: Pending) {
    setPending({ file, id, parent }); setError("");
    const kind = isVideo(file) ? "video" : "document";
    if (kind === "document" && (!DOCUMENT_TYPES.includes(file.type) || file.size > MAX_DOCUMENT_BYTES)) { setError("Choose a video up to 2 GB, or a PDF, document, presentation or image up to 25 MB."); return; }
    if (kind === "video" && file.size > 2 * 1024 ** 3) { setError("Choose a video up to 2 GB."); return; }
    setBusy(true); setProgress(0);
    try {
      const ticket = unwrapContent(await beginUpload({ academyId, unitId, assetId: id, name: file.name, mime: file.type, size: file.size, kind }));
      if (!mounted.current) return;
      if (kind === "document") {
        const result = await createClient().storage.from("content-documents").upload(ticket.path!, file, { contentType: file.type, upsert: false });
        if (result.error && !result.error.message.toLowerCase().includes("already exists")) throw new Error("Document upload failed. Retry the upload.");
        unwrapContent(await finishDocument(academyId, id));
      } else if (ticket.url) {
        await new Promise<void>((resolve, reject) => {
          const request = new XMLHttpRequest(); xhr.current = request;
          request.open("PUT", ticket.url!); request.timeout = 30 * 60 * 1000;
          request.upload.onprogress = event => { if (event.lengthComputable && mounted.current) setProgress(Math.round(event.loaded / event.total * 100)); };
          request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("Video upload failed. Retry the upload."));
          request.onerror = () => reject(new Error("The upload lost its connection. Retry the upload."));
          request.ontimeout = () => reject(new Error("The upload timed out. Retry it."));
          request.onabort = () => reject(new Error("Upload cancelled."));
          request.send(file);
        });
      }
      if (mounted.current) {
        setProgress(100); setPending(null);
        onUploaded({ id: newUuid(), kind: kind === "video" ? "explanation" : "document", title: file.name, assetId: id }, parent);
      }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Upload failed. Retry it."); }
    finally { if (mounted.current) setBusy(false); }
  }
  return {
    busy, progress, error, pending,
    start: (file: File, parent?: ContentItem) => { if (!busy) void upload({ file, id: newUuid(), parent }); },
    retry: () => { if (pending && !busy) void upload(pending); },
  };
}

/** A detached action tile under the material list. */
export const TILE = "group flex w-full items-center gap-3 rounded-lg bg-card px-3 py-3 text-start text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60";
export function TileIcon({ icon, active }: { icon: typeof Upload04Icon; active?: boolean }) {
  return <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors ${active ? "bg-primary/10" : "bg-muted"}`}><HugeiconsIcon icon={icon} strokeWidth={1.5} className="size-5" aria-hidden="true" /></span>;
}

/** Drop or browse for a video (explanation) or document; shows the upload's progress in place. */
export function MaterialUploader({ upload, disabled }: { upload: MaterialUpload; disabled: boolean }) {
  const [dragging, setDragging] = useState(false);
  const { busy, progress, error, pending } = upload;
  const pick = (file?: File) => { if (file && !disabled && !busy) upload.start(file); };
  return <div className="space-y-1.5">
    {busy ? <div role="status" className={`${TILE} hover:bg-card hover:text-muted-foreground`}>
      <TileIcon icon={Upload04Icon} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex items-center gap-1.5 text-sm text-foreground"><span dir="auto" className="min-w-0 truncate font-medium">{pending?.file.name}</span><span className="ms-auto shrink-0 text-xs text-muted-foreground tabular-nums">{progress < 100 ? `${progress}%` : "Finishing…"}</span></p>
        <Progress value={progress} className="h-1" />
      </div>
    </div>
    : <label onDragOver={event => { if (!event.dataTransfer.types.includes("Files")) return; event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files[0]); }}
      className={`${TILE} focus-within:ring-[3px] focus-within:ring-ring/50 ${disabled ? "pointer-events-none opacity-60" : dragging ? "cursor-copy bg-primary/5 text-primary" : "cursor-pointer"}`}>
      <TileIcon icon={Upload04Icon} active={dragging} />
      <span className="text-sm font-medium">{dragging ? "Drop to upload" : "Upload a video or document"}</span>
      <input aria-label="Upload video or document" type="file" className="sr-only" disabled={disabled} accept={["video/*", ...DOCUMENT_TYPES].join(",")} onChange={event => { pick(event.target.files?.[0]); event.target.value = ""; }} />
    </label>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-2 px-2"><p className="text-sm text-destructive">{error}</p>{pending && <Button variant="ghost" size="sm" disabled={disabled} onClick={upload.retry}><HugeiconsIcon icon={RefreshIcon} strokeWidth={1.5} aria-hidden="true" />Retry</Button>}</div>}
  </div>;
}
