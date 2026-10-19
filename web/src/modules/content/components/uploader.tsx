"use client";
import { newUuid } from "@/lib/uuid";
import { useEffect, useRef, useState } from "react";
import { IconUpload } from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
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
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState("");
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
  return <div className="space-y-2">
    <Input aria-label={kind === "video" ? "Upload video" : "Upload document"} type="file" disabled={disabled || busy} accept={kind === "video" ? "video/*" : DOCUMENT_TYPES.join(",")} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file, newUuid()); event.target.value = ""; }} />
    <p className="text-xs text-muted-foreground">{kind === "video" ? "Uploads directly to Mux. Wait for processing before publishing." : "Private files, up to 25 MB. Students never receive a public storage URL."}</p>
    {busy && <div role="status" className="space-y-1"><Progress value={progress} /><p className="text-xs">{progress < 100 ? `Uploading ${progress}%` : "Finishing upload…"}</p></div>}
    {error && <div role="alert"><p className="text-sm text-destructive">{error}</p>{pending && <Button variant="outline" size="sm" disabled={busy || disabled} onClick={() => upload(pending.file, pending.id)}><IconUpload />Retry upload</Button>}</div>}
  </div>;
}
