"use client";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowUp01Icon, Delete02Icon, LinkSquare02Icon, MoreHorizontalIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { useCanonicalHref } from "@/modules/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ContentDetail } from "../data";
import { KIND_LABELS, type ContentItem } from "../types";
import { MaterialPreview } from "./preview";
import { KindIcon } from "./kind-icon";

const STATUS_LABELS: Record<string, string> = { uploading: "Uploading", processing: "Processing", ready: "Ready", failed: "Failed" };
const STATUS_TONES: Record<string, string> = { uploading: "bg-sky-500", processing: "bg-amber-500 animate-pulse", failed: "bg-destructive" };

/** One material in the unit: kind, editable title, its preview or processing action, and ordering. */
export function MaterialRow({ academyId, item, asset, position, first, last, disabled, onTitle, onMove, onRemove, onRefresh }: {
  academyId: string; item: ContentItem; asset?: ContentDetail["assets"][number]; position: number; first: boolean; last: boolean; disabled: boolean;
  onTitle: (title: string) => void; onMove: (delta: number) => void; onRemove: () => void; onRefresh: () => Promise<void>;
}) {
  const href = useCanonicalHref();
  return <li className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
    <span className="w-5 shrink-0 text-center text-xs font-medium text-muted-foreground tabular-nums">{position}</span>
    <KindIcon kind={item.kind} />
    <div className="min-w-0 flex-1">
      <Input aria-label="Material title" dir="auto" className="-ml-2 h-8 border-transparent bg-transparent px-2 font-medium shadow-none hover:border-input focus-visible:border-ring disabled:opacity-100 dark:bg-transparent" value={item.title} maxLength={250} disabled={disabled} onChange={e => onTitle(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{KIND_LABELS[item.kind]}</span>
        {asset && asset.status !== "ready" && <span className={`inline-flex items-center gap-1.5 ${asset.status === "failed" ? "text-destructive" : ""}`}><span className={`size-1.5 rounded-full ${STATUS_TONES[asset.status] ?? "bg-muted-foreground"}`} aria-hidden="true" />{STATUS_LABELS[asset.status] ?? asset.status}</span>}
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
