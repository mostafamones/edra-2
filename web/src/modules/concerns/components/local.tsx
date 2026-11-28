import { Cancel01Icon, File01Icon, Loading03Icon, Mic01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Progress } from "@/components/ui/progress";
import { cn } from "cn";
import { formatBytes, formatDuration } from "../media";
import { ConcernIconButton } from "./icon-button";
import type { ConcernUpload } from "./uploads";

/** Files that exist only in this browser: staged in the composer, or on their way up inside a sending message. */
export function ConcernLocalFiles({ files, onRemove, compact, label }: { files: ConcernUpload[]; onRemove?: (file: ConcernUpload) => void; compact?: boolean; label: string }) {
  if (!files.length) return null;
  return <ul className={cn(compact ? "flex flex-wrap gap-2" : "mt-2 space-y-2")} aria-label={label}>
    {files.map((file) => <li key={file.id} className="min-w-0"><LocalFile file={file} compact={compact} onRemove={onRemove && (() => onRemove(file))} /></li>)}
  </ul>;
}

function LocalFile({ file, compact, onRemove }: { file: ConcernUpload; compact?: boolean; onRemove?: () => void }) {
  const url = file.previewUrl;
  const busy = file.status === "uploading" || file.status === "verifying";
  const percent = `${Math.round(file.progress * 100)}%`;
  const remove = onRemove && <ConcernIconButton label="Remove attachment" icon={Cancel01Icon} onClick={onRemove} className={url ? "absolute end-1 top-1 size-6 bg-background/80" : undefined} />;
  if (url) {
    return <div className="relative inline-block max-w-full overflow-hidden rounded-md border">
      <img src={url} alt={file.name} className={cn(compact ? "size-16 object-cover" : "max-h-56 max-w-full object-contain", (busy || file.status === "failed") && "opacity-50")} />
      {busy && <div role="status" aria-label={`Uploading ${file.name} ${percent}`} className="absolute inset-0 grid place-items-center">
        <span className="flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-xs tabular-nums"><HugeiconsIcon icon={Loading03Icon} strokeWidth={1.5} className="size-3.5 animate-spin" aria-hidden="true" />{file.status === "verifying" ? "Checking…" : percent}</span>
      </div>}
      {file.status === "failed" && <div role="alert" className="absolute inset-x-0 bottom-0 bg-background/80 px-2 py-1 text-xs text-destructive">{file.error}</div>}
      {remove}
    </div>;
  }
  const detail = file.status === "uploading" ? `Uploading ${percent}` : file.status === "verifying" ? "Checking…" : file.status === "failed" ? file.error
    : file.kind === "voice" && file.durationSeconds !== null ? formatDuration(file.durationSeconds) : formatBytes(file.bytes);
  return <div className="flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5">
    <HugeiconsIcon icon={file.kind === "voice" ? Mic01Icon : File01Icon} strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm" dir="auto" title={file.name}>{file.name}</span>
      <span role={file.status === "failed" ? "alert" : busy ? "status" : undefined} className={file.status === "failed" ? "block text-xs text-destructive" : "block text-xs text-muted-foreground"}>{detail}</span>
      {file.status === "uploading" && <Progress value={file.progress * 100} className="mt-1" aria-label={`Uploading ${file.name}`} />}
    </span>
    {remove}
  </div>;
}
