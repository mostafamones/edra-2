"use client";
import { newUuid } from "@/lib/uuid";
import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { RefreshIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import { beginUpload, finishDocument } from "../media-actions";
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, unwrapContent } from "../types";

export function MaterialUploader({ academyId, unitId, kind, disabled, onUploaded, onBusy }: {
  academyId: string; unitId: string; kind: "video" | "document"; disabled: boolean;
  onUploaded: (assetId: string, name: string) => void; onBusy: (busy: boolean) => void;
}) {
  const [pending, setPending] = useState<{ file: File; id: string } | null>(null);
  const [dragging, setDragging] = useState(false), [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState("");
  const xhr = useRef<XMLHttpRequest | null>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; xhr.current?.abort(); }; }, []);
  async function upload(file: File, id: string) {
    setPending({ file, id }); setError("");
    if (kind === "document" && (!DOCUMENT_TYPES.includes(file.type) || file.size > MAX_DOCUMENT_BYTES)) { setError("Choose a PDF, document, presentation or image up to 25 MB."); return; }
    if (kind === "video" && (!file.type.startsWith("video/") || file.size > 2 * 1024 ** 3)) { setError("Choose a video up to 2 GB."); return; }
    setBusy(true); onBusy(true); setProgress(0);
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
      if (mounted.current) { setProgress(100); setPending(null); onUploaded(id, file.name); }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Upload failed. Retry it."); }
    finally { if (mounted.current) { setBusy(false); onBusy(false); } }
  }
  const label = kind === "video" ? "Upload video" : "Upload document";
  const pick = (file?: File) => { if (file && !disabled && !busy) void upload(file, newUuid()); };
  return <div className="space-y-3">
    <label onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files[0]); }}
      className={`group flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center transition-colors focus-within:ring-[3px] focus-within:ring-ring/50 ${disabled || busy ? "cursor-not-allowed bg-muted/30 opacity-60" : dragging ? "cursor-copy border-primary bg-primary/5" : "cursor-pointer bg-muted/30 hover:border-foreground/20 hover:bg-muted/60"}`}>
      <span className="mb-1 flex size-11 items-center justify-center rounded-full border bg-background shadow-xs transition-transform group-hover:-translate-y-0.5"><HugeiconsIcon icon={Upload04Icon} strokeWidth={1.5} className="size-5 text-muted-foreground" aria-hidden="true" /></span>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{kind === "video" ? "Up to 2 GB" : "PDF, document, presentation or image · up to 25 MB"}</span>
      <input aria-label={label} type="file" className="sr-only" disabled={disabled || busy} accept={kind === "video" ? "video/*" : DOCUMENT_TYPES.join(",")} onChange={event => { pick(event.target.files?.[0]); event.target.value = ""; }} />
    </label>
    {busy && <div role="status" className="space-y-1"><Progress value={progress} /><p className="text-xs text-muted-foreground">{progress < 100 ? `Uploading ${progress}%` : "Finishing upload…"}</p></div>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-2"><p className="text-sm text-destructive">{error}</p>{pending && <Button variant="outline" size="sm" disabled={busy || disabled} onClick={() => upload(pending.file, pending.id)}><HugeiconsIcon icon={RefreshIcon} aria-hidden="true" />Retry upload</Button>}</div>}
  </div>;
}
