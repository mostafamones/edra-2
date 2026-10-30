"use client";

import { useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, Loading03Icon } from "@hugeicons/core-free-icons";

import { PALETTE_KEYS, type PaletteKey } from "@/lib/palette";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAcademyScope } from "@/modules/auth";
import { newUuid } from "@/lib/uuid";
import { cn } from "@/lib/utils";
import { createLabel, deleteLabel, updateLabel } from "../actions";
import { labelsQueryKey, useLabels } from "../queries";
import type { Label, LabelFailure } from "../types";
import { LABEL_NAME_MAX, labelNameSchema, sortLabels } from "../validation";
import { LabelColorPicker } from "./color";

type Props = {
  academyId: string;
  onChanged?: () => void;
  /** A rename, recolor (the new label) or confirmed deletion (null) as it happens, before the server answers. */
  onLabelChange?: (labelId: string, label: Label | null) => void;
};

/**
 * Creates, renames, recolors and deletes the academy's labels (managers only; the database enforces
 * it). Changes apply to every use and show at once, undone if the server refuses. `onChanged` lets
 * the consuming module refresh its own caches once the server has answered.
 */
export function LabelEditor({ academyId, onChanged, onLabelChange }: Props) {
  const labels = useLabels(academyId);
  const queryClient = useQueryClient();
  const isCurrent = useAcademyScope();
  const newName = useRef<HTMLInputElement>(null);
  // The label whose uses the server is counting; only a deletion waits for an answer before showing.
  const [checking, setChecking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ label: Label; uses: number } | null>(null);
  const deleted = useRef(false);
  const sending = useRef(0);

  async function patch(change: (labels: Label[]) => Label[]) {
    const queryKey = labelsQueryKey(academyId);
    // A catalog request already running would otherwise overwrite the change when it finishes.
    await queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData<Label[]>(queryKey, (labels) => labels && sortLabels(change(labels)));
  }
  async function refresh() {
    onChanged?.();
    await queryClient.invalidateQueries({ queryKey: labelsQueryKey(academyId) });
  }
  /** Runs one command and undoes its change on failure; caches refresh when the last command answers, but UI changes only while the academy is current. */
  async function send<T extends { ok: boolean }>(command: () => Promise<T | LabelFailure>, undo: () => void): Promise<T | null> {
    setProblem(null);
    sending.current += 1;
    try {
      const result = await command();
      if (result.ok) return result as T;
      undo();
      if (isCurrent(academyId)) setProblem((result as LabelFailure).message);
    } catch {
      undo();
      if (isCurrent(academyId)) setProblem("Could not reach the server. Check your connection and try again.");
    } finally {
      sending.current -= 1;
      if (sending.current === 0) void refresh();
    }
    return null;
  }

  async function save(label: Label, name: string, color: PaletteKey) {
    const swap = (next: Label) => {
      void patch((labels) => labels.map((entry) => entry.id === next.id ? next : entry));
      onLabelChange?.(next.id, next);
    };
    swap({ ...label, name, color });
    await send(() => updateLabel({ academyId, labelId: label.id, name, color }), () => swap(label));
  }

  async function checkDelete(label: Label) {
    setChecking(label.id);
    const result = await send(async () => {
      const answer = await deleteLabel({ academyId, labelId: label.id, confirmed: false });
      if (answer.ok && answer.deleted) await patch((labels) => labels.filter((entry) => entry.id !== label.id));
      return answer;
    }, () => undefined);
    if (!isCurrent(academyId)) return;
    setChecking(null);
    if (!result || !("deleted" in result)) return;
    if (!result.deleted) { setConfirming({ label, uses: result.uses }); return; }
    // The row is gone; continue from the new-label field.
    newName.current?.focus();
  }

  async function confirmDelete(label: Label) {
    deleted.current = true;
    setConfirming(null);
    onLabelChange?.(label.id, null);
    void patch((labels) => labels.filter((entry) => entry.id !== label.id));
    await send(() => deleteLabel({ academyId, labelId: label.id, confirmed: true }), () => void patch((labels) => [...labels, label]));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-heading text-sm font-semibold">Labels</p>
      <NewLabel inputRef={newName} used={labels.data?.map((label) => label.color) ?? []}
        onCreate={async (labelId, name, color) => {
          await patch((current) => [...current, { id: labelId, name, color }]);
          const result = await send(() => createLabel({ academyId, labelId, name, color }), () => void patch((current) => current.filter((entry) => entry.id !== labelId)));
          return result !== null;
        }} />
      {labels.isPending ? (
        <div role="status" aria-label="Loading labels" className="flex flex-col gap-2"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
      ) : labels.isError ? (
        <div role="alert" className="flex items-center justify-between gap-2 text-sm">
          Couldn’t load labels.
          <Button size="sm" variant="outline" disabled={labels.isFetching} onClick={() => void labels.refetch()}>Retry</Button>
        </div>
      ) : labels.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No labels yet</p>
      ) : (
        <ul aria-label="Academy labels" className="-mx-1 flex max-h-72 flex-col gap-1 overflow-y-auto px-1">
          {labels.data.map((label) => (
            <LabelRow key={label.id} label={label} busy={checking === label.id} onSave={(name, color) => void save(label, name, color)} onDelete={() => void checkDelete(label)} />
          ))}
        </ul>
      )}
      {problem && <p role="alert" className="text-xs text-destructive">{problem}</p>}

      <AlertDialog open={confirming !== null} onOpenChange={(open) => { if (!open) setConfirming(null); }}>
        <AlertDialogContent onCloseAutoFocus={(event) => {
          // The deleted label's row is gone; continue from the new-label field.
          if (deleted.current) { event.preventDefault(); deleted.current = false; newName.current?.focus(); }
        }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirming?.label.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Used {confirming?.uses} {confirming?.uses === 1 ? "time" : "times"}. It will be removed everywhere.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { if (confirming) void confirmDelete(confirming.label); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type RowProps = { label: Label; busy: boolean; onSave: (name: string, color: PaletteKey) => void; onDelete: () => void };

/** Rename on Enter or leaving the field (Escape reverts); recolor applies at once. */
function LabelRow({ label, busy, onSave, onDelete }: RowProps) {
  const [name, setName] = useState(label.name);
  // Follows the stored name, including when a refused rename is undone.
  const [stored, setStored] = useState(label.name);
  if (stored !== label.name) { setStored(label.name); setName(label.name); }
  const save = () => {
    const parsed = labelNameSchema.safeParse(name);
    if (!parsed.success) { setName(label.name); return; }
    if (parsed.data !== label.name) onSave(parsed.data, label.color);
  };
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") { event.preventDefault(); save(); }
    if (event.key === "Escape" && name !== label.name) { event.preventDefault(); event.stopPropagation(); setName(label.name); }
  };
  return (
    <li className="group/row flex items-center gap-0.5" aria-busy={busy}>
      <LabelColorPicker label={`Color of ${label.name}`} value={label.color} disabled={busy} onChange={(color) => { if (color !== label.color) onSave(label.name, color); }} />
      <Input variant="line" aria-label={`Name of ${label.name}`} className="disabled:opacity-100" maxLength={LABEL_NAME_MAX} value={name} disabled={busy}
        onChange={(event) => setName(event.target.value)} onBlur={save} onKeyDown={keys} />
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          {/* Shows on hover, focus or while saving (always on touch). */}
          <Button type="button" variant="ghost" size="icon-sm" className={cn("shrink-0", busy ? undefined : "opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 pointer-coarse:opacity-100")} disabled={busy} aria-label={`Delete ${label.name}`} onClick={onDelete}>
            <HugeiconsIcon icon={busy ? Loading03Icon : Delete02Icon} strokeWidth={1.5} className={busy ? "animate-spin" : undefined} aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete label</TooltipContent>
      </Tooltip>
    </li>
  );
}

type NewProps = {
  inputRef: RefObject<HTMLInputElement | null>; used: PaletteKey[];
  onCreate: (labelId: string, name: string, color: PaletteKey) => Promise<boolean>;
};

/** Enter adds the label at once; the field gets the name back if the server refuses it. */
function NewLabel({ inputRef, used, onCreate }: NewProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<PaletteKey | null>(null);
  // One ID per new label, kept across retries so a repeated request cannot create it twice.
  const [labelId, setLabelId] = useState(() => newUuid());
  const chosen = color ?? PALETTE_KEYS.find((key) => !used.includes(key)) ?? PALETTE_KEYS[used.length % PALETTE_KEYS.length];
  const submit = async () => {
    const parsed = labelNameSchema.safeParse(name);
    if (!parsed.success) return;
    setName("");
    setColor(null);
    setLabelId(newUuid());
    // Something typed since then is not replaced.
    if (!await onCreate(labelId, parsed.data, chosen) && inputRef.current?.value === "") {
      setName(name);
      setColor(chosen);
      setLabelId(labelId);
    }
  };
  return (
    <form className="relative" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <LabelColorPicker label="New label color" className="absolute start-0 top-0.5" value={chosen} onChange={setColor} />
      <Input ref={inputRef} variant="line" data-new-label aria-label="New label name" placeholder="New label" className="ps-7" maxLength={LABEL_NAME_MAX} value={name}
        onChange={(event) => { setName(event.target.value); setLabelId(newUuid()); }} />
    </form>
  );
}
