"use client";

import { useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete02Icon, Loading03Icon } from "@hugeicons/core-free-icons";

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
import { LABEL_NAME_MAX, labelNameSchema } from "../validation";
import { LabelColorPicker } from "./color";

type Props = { academyId: string; onChanged?: () => void };

/**
 * Creates, renames, recolors and deletes the academy's labels (managers only; the database enforces
 * it). Changes apply to every use. `onChanged` lets the consuming module refresh its own caches.
 */
export function LabelEditor({ academyId, onChanged }: Props) {
  const labels = useLabels(academyId);
  const queryClient = useQueryClient();
  const isCurrent = useAcademyScope();
  const newName = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ label: Label; uses: number } | null>(null);
  const deleted = useRef(false);

  /** Runs one command; refreshes caches of the captured academy, but touches UI only while it is current. */
  async function run<T extends { ok: boolean }>(key: string, command: () => Promise<T | LabelFailure>): Promise<T | null> {
    setBusy(key);
    setProblem(null);
    try {
      const result = await command();
      if (!isCurrent(academyId)) return null;
      if (!result.ok) { setProblem((result as LabelFailure).message); return null; }
      return result as T;
    } catch {
      if (isCurrent(academyId)) setProblem("Could not reach the server. Check your connection and try again.");
      return null;
    } finally {
      if (isCurrent(academyId)) setBusy(null);
    }
  }
  async function refresh() {
    onChanged?.();
    await queryClient.invalidateQueries({ queryKey: labelsQueryKey(academyId) });
  }

  async function remove(label: Label, confirmed: boolean) {
    const result = await run(label.id, () => deleteLabel({ academyId, labelId: label.id, confirmed }));
    if (!result || !("deleted" in result)) return;
    if (!result.deleted) { setConfirming({ label, uses: result.uses }); return; }
    deleted.current = confirmed;
    setConfirming(null);
    await refresh();
    // The row is gone; continue from the new-label field (the dialog does this when it closes).
    if (!confirmed && isCurrent(academyId)) newName.current?.focus();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-heading text-sm font-semibold">Labels</p>
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
            <LabelRow key={`${label.id}:${label.name}:${label.color}`} label={label} busy={busy === label.id} disabled={busy !== null}
              onSave={async (name, color) => { if (await run(label.id, () => updateLabel({ academyId, labelId: label.id, name, color }))) await refresh(); }}
              onDelete={() => void remove(label, false)} />
          ))}
        </ul>
      )}
      <NewLabel inputRef={newName} busy={busy === "new"} disabled={busy !== null} used={labels.data?.map((label) => label.color) ?? []}
        onCreate={async (labelId, name, color) => {
          const result = await run("new", () => createLabel({ academyId, labelId, name, color }));
          if (result) await refresh();
          return result !== null;
        }} />
      {problem && <p role="alert" className="text-xs text-destructive">{problem}</p>}

      <AlertDialog open={confirming !== null} onOpenChange={(open) => { if (!open && busy === null) setConfirming(null); }}>
        <AlertDialogContent onCloseAutoFocus={(event) => {
          // The deleted label's row is gone; continue from the new-label field.
          if (deleted.current) { event.preventDefault(); deleted.current = false; newName.current?.focus(); }
        }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirming?.label.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Used {confirming?.uses} {confirming?.uses === 1 ? "time" : "times"}. It will be removed everywhere.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy !== null}
              onClick={(event) => { event.preventDefault(); if (confirming) void remove(confirming.label, true); }}>
              {busy !== null && <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type RowProps = { label: Label; busy: boolean; disabled: boolean; onSave: (name: string, color: PaletteKey) => Promise<void>; onDelete: () => void };

/** Rename on Enter or leaving the field (Escape reverts); recolor applies at once. */
function LabelRow({ label, busy, disabled, onSave, onDelete }: RowProps) {
  const [name, setName] = useState(label.name);
  const save = () => {
    const parsed = labelNameSchema.safeParse(name);
    if (!parsed.success) { setName(label.name); return; }
    if (parsed.data !== label.name) void onSave(parsed.data, label.color);
  };
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") { event.preventDefault(); save(); }
    if (event.key === "Escape" && name !== label.name) { event.preventDefault(); event.stopPropagation(); setName(label.name); }
  };
  return (
    <li className="group/row flex items-center gap-0.5" aria-busy={busy}>
      <LabelColorPicker label={`Color of ${label.name}`} value={label.color} disabled={disabled} onChange={(color) => { if (color !== label.color) void onSave(label.name, color); }} />
      <Input aria-label={`Name of ${label.name}`} className="h-8 border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-ring disabled:opacity-100 dark:bg-transparent" maxLength={LABEL_NAME_MAX} value={name} disabled={disabled}
        onChange={(event) => setName(event.target.value)} onBlur={save} onKeyDown={keys} />
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          {/* Shows on hover, focus or while saving (always on touch). */}
          <Button type="button" variant="ghost" size="icon-sm" className={cn("shrink-0", busy ? undefined : "opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 pointer-coarse:opacity-100")} disabled={disabled} aria-label={`Delete ${label.name}`} onClick={onDelete}>
            <HugeiconsIcon icon={busy ? Loading03Icon : Delete02Icon} strokeWidth={1.5} className={busy ? "animate-spin" : undefined} aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete label</TooltipContent>
      </Tooltip>
    </li>
  );
}

type NewProps = {
  inputRef: RefObject<HTMLInputElement | null>; busy: boolean; disabled: boolean; used: PaletteKey[];
  onCreate: (labelId: string, name: string, color: PaletteKey) => Promise<boolean>;
};

function NewLabel({ inputRef, busy, disabled, used, onCreate }: NewProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<PaletteKey | null>(null);
  // One ID per new label, kept across retries so a repeated request cannot create it twice.
  const [labelId, setLabelId] = useState(() => newUuid());
  const chosen = color ?? PALETTE_KEYS.find((key) => !used.includes(key)) ?? PALETTE_KEYS[used.length % PALETTE_KEYS.length];
  const parsed = labelNameSchema.safeParse(name);
  const submit = async () => {
    if (!parsed.success || disabled) return;
    if (await onCreate(labelId, parsed.data, chosen)) {
      setName("");
      setColor(null);
      setLabelId(newUuid());
      inputRef.current?.focus();
    }
  };
  return (
    <form className="flex items-center gap-1 border-t pt-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div className="relative min-w-0 flex-1">
        <LabelColorPicker label="New label color" className="absolute start-0 top-1" value={chosen} disabled={disabled} onChange={setColor} />
        <Input ref={inputRef} data-new-label aria-label="New label name" placeholder="New label" className="h-8 ps-9" maxLength={LABEL_NAME_MAX} value={name}
          disabled={disabled} onChange={(event) => { setName(event.target.value); setLabelId(newUuid()); }} />
      </div>
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <Button type="submit" variant="ghost" size="icon-sm" disabled={disabled || !parsed.success} aria-label="Add label">
            <HugeiconsIcon icon={busy ? Loading03Icon : Add01Icon} strokeWidth={1.5} className={busy ? "animate-spin" : undefined} aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Add label</TooltipContent>
      </Tooltip>
    </form>
  );
}
