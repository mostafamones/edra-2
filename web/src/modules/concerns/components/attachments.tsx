import { useState } from "react";
import { Download01Icon, File01Icon, Pdf01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import type { ConcernAttachment } from "../contracts";
import { concernMediaUrl, formatBytes } from "../media";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConcernVoicePlayer } from "./voice";

/** A live message's media. URLs are same-origin and recheck access on every request. */
export function ConcernAttachments({ attachments, academyId, concernId }: { attachments: ConcernAttachment[]; academyId: string; concernId: string }) {
  if (!attachments.length) return null;
  return <ul className="mt-2 space-y-2" aria-label="Attachments">
    {attachments.map((attachment) => <li key={attachment.id} className="min-w-0">
      <ConcernAttachmentItem attachment={attachment} url={concernMediaUrl(academyId, concernId, attachment.id)} download={concernMediaUrl(academyId, concernId, attachment.id, true)} />
    </li>)}
  </ul>;
}

function ConcernAttachmentItem({ attachment, url, download }: { attachment: ConcernAttachment; url: string; download: string }) {
  const [broken, setBroken] = useState(false);
  if (attachment.kind === "voice") return <ConcernVoicePlayer src={url} durationSeconds={attachment.durationSeconds} downloadUrl={download} />;
  // The server labels a file image/* only after proving the bytes are a safe inline image type.
  if (attachment.contentType.startsWith("image/") && !broken) {
    return <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block max-w-full rounded-md focus-visible:outline-2 focus-visible:outline-ring">
      <img src={url} alt={attachment.name} loading="lazy" decoding="async" className="max-h-56 max-w-full rounded-md border object-contain" onError={() => setBroken(true)} />
    </a>;
  }
  const pdf = attachment.contentType === "application/pdf";
  return <div className="flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5">
    <HugeiconsIcon icon={pdf ? Pdf01Icon : File01Icon} strokeWidth={1.5} className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    <span className="min-w-0 flex-1"><span className="block truncate text-sm" dir="auto" title={attachment.name}>{attachment.name}</span>
      <span className="block text-xs text-muted-foreground">{broken ? "Preview unavailable" : formatBytes(attachment.bytes)}</span></span>
    {pdf && <Button asChild size="sm" variant="ghost"><a href={url} target="_blank" rel="noopener noreferrer">Open</a></Button>}
    <Tooltip><TooltipTrigger asChild><Button asChild size="icon-sm" variant="ghost"><a href={download} aria-label={`Download ${attachment.name}`}>
      <HugeiconsIcon icon={Download01Icon} strokeWidth={1.5} aria-hidden="true" /></a></Button></TooltipTrigger><TooltipContent>Download</TooltipContent></Tooltip>
  </div>;
}
