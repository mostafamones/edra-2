"use client";
import Link from "next/link";
import { useState, type DragEvent, type FocusEvent, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, LinkSquare02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { useCanonicalHref } from "@/modules/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContentDetail } from "../data";
import { KIND_LABELS, type ContentItem } from "../types";
import { ACTION, MaterialPreview } from "./preview";
import { KindIcon } from "./kind-icon";

const STATUS_LABELS: Record<string, string> = { uploading: "Uploading", processing: "Processing", ready: "Ready", failed: "Failed" };
const STATUS_TONES: Record<string, string> = { uploading: "bg-sky-500", processing: "bg-amber-500 animate-pulse", failed: "bg-destructive" };
const ASSESSMENT_LABELS = { assignment: "Assignment", quiz: "Quiz", exam: "Exam" };
// Each child hangs off a rounded └; the rail continues past every child but the last. The line colour is solid
// (dark mode's border token is translucent), so where the rail and an elbow overlap they don't darken.
const LINE = "border-border dark:border-muted";
const BRANCH = "relative ps-5 before:absolute before:inset-y-0 before:start-0 before:w-px before:bg-border dark:before:bg-muted last:before:hidden my-0.5";
function Elbow() { return <span aria-hidden="true" className={`pointer-events-none absolute start-0 top-0 h-1/2 w-5 rounded-es-lg border-b border-s ${LINE}`} />; }
// The title field grows in steps of this many characters rather than filling the row.
const TITLE_STEP = 14;
export type Zone = "link" | "before" | "after";
export type MaterialDrop = { file: File } | { zone: Zone };
const Separator = () => <span className="text-muted-foreground/40" aria-hidden="true">|</span>;

export function materialLabel(item: ContentItem, asset?: ContentDetail["assets"][number]) {
  if (item.kind === "assessment") return ASSESSMENT_LABELS[item.assessmentKind!];
  if (item.kind === "answer") return `Answer ${asset?.kind === "document" ? "document" : "video"}`;
  return item.attached ? "Attached document" : KIND_LABELS[item.kind];
}

/** One material in the unit: kind, editable title and its preview or processing action. Selecting it opens the material bar.
 * The whole row drags. Dropping attaches material to an assessment (answers) or a video (documents), or places it beside the row;
 * children branch from their parent like steps. */
export function MaterialRow({ academyId, item, asset, disabled, child, children, selected, drag, acceptsFiles,
  onSelect, onTitle, onRefresh, onDragStart, onDragEnd, onDrop }: {
  academyId: string; item: ContentItem; asset?: ContentDetail["assets"][number]; disabled: boolean;
  child?: boolean; children?: ReactNode[]; selected: boolean; drag: { link: boolean; place: boolean } | null; acceptsFiles: boolean;
  onSelect: () => void; onTitle: (title: string) => void; onRefresh: () => Promise<void>;
  onDragStart: () => void; onDragEnd: () => void; onDrop: (drop: MaterialDrop) => void;
}) {
  const href = useCanonicalHref();
  const [zone, setZone] = useState<Zone | null>(null), [editing, setEditing] = useState(false);
  function zoneAt(event: DragEvent): Zone | null {
    if (event.dataTransfer.types.includes("Files")) return acceptsFiles ? "link" : null;
    if (!drag) return null;
    const box = event.currentTarget.getBoundingClientRect(), y = (event.clientY - box.top) / box.height;
    // A parent row's lower part attaches; only its top edge places a row before it.
    if (drag.link) return drag.place && y < 0.3 ? "before" : "link";
    return drag.place ? y < 0.5 ? "before" : "after" : null;
  }
  const handlers = disabled ? {} : {
    draggable: !editing, tabIndex: 0, "data-material-row": item.id,
    onPointerDown: onSelect, onFocus: (event: FocusEvent) => { if (event.target === event.currentTarget) onSelect(); },
    onDragStart: (event: DragEvent) => { event.dataTransfer.setData("text/plain", item.title); event.dataTransfer.effectAllowed = "move"; onDragStart(); },
    onDragEnd,
    onDragOver: (event: DragEvent) => { const next = zoneAt(event); if (next) event.preventDefault(); setZone(next); },
    onDragLeave: (event: DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setZone(null); },
    onDrop: (event: DragEvent) => {
      const at = zoneAt(event), file = event.dataTransfer.files[0];
      event.preventDefault(); setZone(null);
      if (file && at) onDrop({ file }); else if (at) onDrop({ zone: at });
    },
  };
  const slot = zone === "link" && (item.kind === "assessment" || item.kind === "explanation");
  const branches = [...children ?? [], slot && <li key="slot" className={BRANCH} aria-hidden="true"><Elbow />
    <div className="flex items-center gap-3 py-2 ps-2 pe-3"><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><HugeiconsIcon icon={Add01Icon} strokeWidth={1.5} className="size-4" /></span><span className="text-sm text-primary">{item.kind === "assessment" ? "Add as answer" : "Attach document"}</span></div>
  </li>].filter(Boolean);
  const action = item.kind === "assessment"
    ? <Button asChild variant="ghost" size="sm" className={ACTION}><Link target="_blank" rel="noopener noreferrer" href={href(`/app/${item.assessmentKind === "quiz" ? "quizzes" : item.assessmentKind === "exam" ? "exams" : "assignments"}/${item.assessmentId}`)}><HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.5} aria-hidden="true" />Open</Link></Button>
    : asset?.status === "ready" ? <MaterialPreview academyId={academyId} assetId={asset.id} title={item.title} document={asset.kind === "document"} />
    : asset?.kind === "video" ? <Button variant="ghost" size="sm" className={ACTION} onClick={() => void onRefresh()}><HugeiconsIcon icon={RefreshIcon} strokeWidth={1.5} aria-hidden="true" />Refresh</Button> : null;
  return <li className={child ? BRANCH : undefined}>
    {child && <Elbow />}
    <div {...handlers} data-selected={selected || undefined}
      className={`group/row relative flex items-center gap-3 outline-none transition-colors ${child ? "rounded-md py-2 ps-2 pe-3" : "px-3 py-3"} ${!disabled && !editing ? "cursor-grab active:cursor-grabbing" : ""} ${zone === "link" ? "bg-primary/5 ring-1 ring-primary/50 ring-inset" : selected ? "bg-primary/10" : "hover:bg-muted/40 focus-visible:bg-muted/40"}`}>
      {(zone === "before" || zone === "after") && <span aria-hidden="true" className={`pointer-events-none absolute inset-x-3 h-0.5 rounded-full bg-primary ${zone === "before" ? "top-0" : "bottom-0"}`} />}
      <KindIcon kind={item.kind} document={asset?.kind === "document"} small={child} />
      <div className="min-w-0 flex-1">
        <Input aria-label="Material title" dir="auto" style={{ width: `calc(${Math.ceil((item.title.length + 1) / TITLE_STEP) * TITLE_STEP}ch + 1rem)` }} className="-ms-2 h-7 max-w-full border-transparent bg-transparent px-2 font-medium shadow-none hover:border-input focus-visible:border-ring disabled:opacity-100 dark:bg-transparent" value={item.title} maxLength={250} disabled={disabled}
          onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} onChange={e => onTitle(e.target.value)} />
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{materialLabel(item, asset)}</span>
          {!!children?.length && <><Separator /><span className="tabular-nums">{children.length} {item.kind === "assessment" ? "answer" : "document"}{children.length === 1 ? "" : "s"}</span></>}
          {asset && asset.status !== "ready" && <><Separator /><span className={`inline-flex items-center gap-1.5 ${asset.status === "failed" ? "text-destructive" : ""}`}><span className={`size-1.5 rounded-full ${STATUS_TONES[asset.status] ?? "bg-muted-foreground"}`} aria-hidden="true" />{STATUS_LABELS[asset.status] ?? asset.status}</span></>}
        </p>
      </div>
      {/* A child's action shows on hover, focus or selection (always on touch). */}
      {action && <div className={`flex shrink-0 items-center ${child && !selected ? "opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 pointer-coarse:opacity-100" : ""}`}>{action}</div>}
    </div>
    {/* The rail starts under the parent's icon (2rem in) and bridges the row's bottom padding. */}
    {branches.length > 0 && <ol aria-label={`${item.kind === "assessment" ? "Answers" : "Documents"} for ${item.title}`} className="relative ms-8 me-2 pb-3 before:absolute before:-top-3 before:start-0 before:h-3 before:w-px before:bg-border dark:before:bg-muted">{branches}</ol>}
  </li>;
}
