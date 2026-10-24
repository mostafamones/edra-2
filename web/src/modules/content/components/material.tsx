"use client";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowUp01Icon, Delete02Icon, File02Icon, LinkSquare02Icon, MoreHorizontalIcon, RefreshIcon, Task01Icon, Video01Icon, VideoReplayIcon } from "@hugeicons/core-free-icons";
import { useCanonicalHref } from "@/modules/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ContentDetail } from "../data";
import { KIND_LABELS, type ContentItem } from "../types";
import { MaterialPreview } from "./preview";

const ICONS = { explanation: Video01Icon, answer: VideoReplayIcon, document: File02Icon, assessment: Task01Icon };
const STATUS_LABELS: Record<string, string> = { uploading: "Uploading", processing: "Processing", ready: "Ready", failed: "Failed" };

/** One material in the unit: kind, editable title, its preview or processing action, and ordering. */
export function MaterialRow({ academyId, item, asset, first, last, disabled, onTitle, onMove, onRemove, onRefresh }: {
  academyId: string; item: ContentItem; asset?: ContentDetail["assets"][number]; first: boolean; last: boolean; disabled: boolean;
  onTitle: (title: string) => void; onMove: (delta: number) => void; onRemove: () => void; onRefresh: () => Promise<void>;
}) {
  const href = useCanonicalHref();
  return <li className="flex items-center gap-3 px-4 py-3">
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><HugeiconsIcon icon={ICONS[item.kind]} className="size-4.5" aria-hidden="true" /></span>
    <div className="min-w-0 flex-1 space-y-1">
      <Input aria-label="Material title" dir="auto" className="h-8" value={item.title} maxLength={250} disabled={disabled} onChange={e => onTitle(e.target.value)} />
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span>{KIND_LABELS[item.kind]}</span>
        {asset && asset.status !== "ready" && <Badge variant={asset.status === "failed" ? "destructive" : "secondary"} className="h-4.5 px-1.5 text-[11px]">{STATUS_LABELS[asset.status] ?? asset.status}</Badge>}
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-1">
      {item.kind === "assessment"
        ? <Button asChild variant="outline" size="sm"><Link target="_blank" rel="noopener noreferrer" href={href(`/app/${item.assessmentKind === "quiz" ? "quizzes" : item.assessmentKind === "exam" ? "exams" : "assignments"}/${item.assessmentId}`)}><HugeiconsIcon icon={LinkSquare02Icon} aria-hidden="true" />Open</Link></Button>
        : asset?.status === "ready" ? <MaterialPreview academyId={academyId} assetId={asset.id} title={item.title} />
        : asset?.kind === "video" ? <Button variant="outline" size="sm" onClick={() => void onRefresh()}><HugeiconsIcon icon={RefreshIcon} aria-hidden="true" />Refresh</Button> : null}
      {!disabled && <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Actions for ${item.title || "material"}`}><HugeiconsIcon icon={MoreHorizontalIcon} /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-fit">
          <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}><HugeiconsIcon icon={ArrowUp01Icon} />Move up</DropdownMenuItem>
          <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}><HugeiconsIcon icon={ArrowDown01Icon} />Move down</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onRemove}><HugeiconsIcon icon={Delete02Icon} />Remove</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>}
    </div>
  </li>;
}
