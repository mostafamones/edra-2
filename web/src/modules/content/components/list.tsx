"use client";
import { useEffect, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { BookOpen01Icon } from "@hugeicons/core-free-icons";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { ContentDetail } from "../data";
import { refreshVideo } from "../media-actions";
import { unwrapContent, type ContentItem } from "../types";
import { AddMaterial } from "./add-material";
import { MaterialBar } from "./bar";
import { materialLabel, MaterialRow, type MaterialDrop } from "./material";
import { dropOptions, linkMaterial, materialTree, moveMaterial, parentOf, placeMaterial, removeMaterial, unlinkMaterial } from "./tree";
import type { MaterialUpload } from "./uploader";
import { UploadedFiles } from "./uploads";

type Asset = ContentDetail["assets"][number];

/** The unit's Material tab: ordered material with answers under assessments and attached documents under videos, then unattached uploads. */
export function MaterialList({ academyId, unitId, version, items, assets, editable, disabled, dirty, upload, onItems, onAdd, onChanged, onRefreshAssets, onError }: {
  academyId: string; unitId: string; version: number; items: ContentItem[]; assets: Asset[]; editable: boolean; disabled: boolean; dirty: boolean;
  upload: MaterialUpload; onItems: (change: (items: ContentItem[]) => ContentItem[]) => void; onAdd: (item: ContentItem) => void;
  onChanged: () => Promise<void>; onRefreshAssets: () => Promise<void>; onError: (message: string) => void;
}) {
  const [dragged, setDragged] = useState<ContentItem | null>(null);
  const [selectedId, setSelected] = useState<string | null>(null);
  const isDocument = (item: ContentItem) => item.kind === "document" || assets.find(a => a.id === item.assetId)?.kind === "document";
  const tree = materialTree(items);
  const selected = disabled ? undefined : items.find(i => i.id === selectedId);
  // Arrow keys move the selection among its siblings; Escape or a click elsewhere clears it.
  useEffect(() => {
    if (!selected) return;
    const id = selected.id;
    const keys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu], [role=listbox]")) return;
      if (event.key === "Escape") { setSelected(null); return; }
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      const focused = target.closest("[data-material-row]") !== null;
      onItems(current => moveMaterial(current, id, event.key === "ArrowUp" ? -1 : 1,
        item => item.kind === "document" || assets.find(a => a.id === item.assetId)?.kind === "document"));
      // Reordering can move the focused row's element; keep keyboard focus on it.
      if (focused) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-material-row="${id}"]`)?.focus());
    };
    const outside = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest("[data-material-row], [data-material-bar], [role=dialog]")) setSelected(null);
    };
    document.addEventListener("keydown", keys);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", keys); document.removeEventListener("pointerdown", outside); };
  }, [selected, onItems, assets]);
  // Drops edit the draft directly; it autosaves and Undo reverts.
  function dropOn(target: ContentItem, drop: MaterialDrop) {
    const source = dragged; setDragged(null);
    if ("file" in drop) { const parent = target.kind === "assessment" || target.kind === "explanation" ? target : parentOf(items, target); if (parent) upload.start(drop.file, parent); return; }
    if (!source) return;
    const { link } = dropOptions(items, source, target, isDocument);
    if (drop.zone === "link") { if (link) onItems(current => linkMaterial(current, source, link, isDocument)); }
    else onItems(current => placeMaterial(current, source.id, target.id, drop.zone === "after", isDocument));
  }
  function dropAtEnd() {
    const source = dragged, end = tree.at(-1)?.item; setDragged(null);
    if (source && end) onItems(current => placeMaterial(current, source.id, end.id, true, isDocument));
  }
  const row = (item: ContentItem, extra: { child?: boolean; children?: ReactNode[] }) => {
    const options = dragged && dropOptions(items, dragged, item, isDocument);
    return <MaterialRow key={item.id} academyId={academyId} item={item} asset={assets.find(a => a.id === item.assetId)} disabled={disabled} {...extra}
      selected={selected?.id === item.id} drag={options && { link: !!options.link, place: options.place }}
      acceptsFiles={item.kind === "assessment" || item.kind === "explanation" || !!extra.child}
      onSelect={() => setSelected(item.id)}
      onTitle={title => onItems(current => current.map(i => i.id === item.id ? { ...i, title } : i))}
      onRefresh={async () => { try { unwrapContent(await refreshVideo(academyId, item.assetId!)); await onRefreshAssets(); } catch { onError("Could not refresh processing. Try again."); } }}
      onDragStart={() => setDragged(item)} onDragEnd={() => setDragged(null)} onDrop={drop => dropOn(item, drop)} />;
  };
  const parent = selected && parentOf(items, selected);
  const siblings = parent ? tree.find(n => n.item.id === parent.id)?.children ?? [] : tree.map(n => n.item);
  const canEnd = !!dragged && dragged.id !== tree.at(-1)?.item.id;
  return <div className="flex flex-col gap-8">
    <section aria-labelledby="material-title" className="flex flex-col gap-2">
      {tree.length > 0
        ? <ol aria-label="Unit material" className="divide-y divide-border/60 overflow-hidden rounded-lg bg-card">
          {tree.map(node => row(node.item, { children: node.children.map(c => row(c, { child: true })) }))}
          {canEnd && <EndSlot onDrop={dropAtEnd} />}
        </ol>
        : !editable && <Empty className="min-h-48 rounded-lg bg-card"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={BookOpen01Icon} strokeWidth={1.5} aria-hidden="true" /></EmptyMedia><EmptyTitle>No material yet</EmptyTitle></EmptyHeader></Empty>}
      {editable && <AddMaterial academyId={academyId} unitId={unitId} version={version} items={items} dirty={dirty} disabled={disabled} upload={upload} onAdd={onAdd} onCreated={onChanged} />}
    </section>
    {selected && <MaterialBar item={selected} label={materialLabel(selected, assets.find(a => a.id === selected.assetId))} document={isDocument(selected)} child={!!parent}
      first={siblings[0]?.id === selected.id} last={siblings.at(-1)?.id === selected.id}
      onMove={delta => onItems(current => moveMaterial(current, selected.id, delta, isDocument))} onFile={file => upload.start(file, selected)}
      onUnlink={() => onItems(current => unlinkMaterial(current, selected.id, isDocument))}
      onRemove={() => { onItems(current => removeMaterial(current, selected.id, isDocument)); setSelected(null); }} onClear={() => setSelected(null)} />}
    {editable && <UploadedFiles academyId={academyId} unitId={unitId} assets={assets} items={items} disabled={disabled} dirty={dirty} onAdd={onAdd} onRefresh={onRefreshAssets} />}
  </div>;
}

/** Shown at the end of the list while a row is dragged, so it can be moved last. */
function EndSlot({ onDrop }: { onDrop: () => void }) {
  const [over, setOver] = useState(false);
  return <li onDragOver={event => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={event => { event.preventDefault(); setOver(false); onDrop(); }}
    className={`relative px-3 py-3 text-sm transition-colors ${over ? "bg-primary/5 text-primary" : "text-muted-foreground"}`}>
    {over && <span aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" />}
    Move to end
  </li>;
}
