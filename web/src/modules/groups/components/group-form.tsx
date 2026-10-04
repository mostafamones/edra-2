"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { IconInfoCircle } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NumberInput } from "@/components/shared/app-input";
import { useAcademyScope } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { toast } from "sonner";
import { createGroup, updateGroup } from "../actions";
import { patchGroupLists } from "../optimistic";
import { groupsRootKey, type Group, type Level, type Track } from "../queries";
import { groupInputSchema } from "../validation";

type Props = {
  /** The academy this draft belongs to. The parent re-mounts the form when the academy changes. */
  academy: AcademyEntry;
  group?: Group;
  levels: Level[];
  tracks: Track[];
  levelNames: Record<string, string>;
  /** Why the level and track are locked; unset when the program can change. */
  programLock?: string;
  sheetLayout?: boolean;
  onSaved: () => void;
  onCancel: () => void;
};

export function GroupForm({ academy, group, levels, tracks, levelNames, programLock, sheetLayout = false, onSaved, onCancel }: Props) {
  const isCurrentAcademy = useAcademyScope();
  const queryClient = useQueryClient();
  const [name, setName] = useState(group?.name ?? "");
  const [levelId, setLevelId] = useState(group?.level_id ?? "");
  const [trackId, setTrackId] = useState(group?.track_id ?? "");
  const [capacity, setCapacity] = useState(group?.capacity?.toString() ?? "");
  const [notes, setNotes] = useState(group?.notes ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const availableTracks = tracks.filter((track) => track.level_id === levelId);
  const hasTracks = availableTracks.length > 0;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    const academyId = academy.id;
    if (group && group.academy_id !== academyId) {
      setError("This group belongs to a different academy.");
      return;
    }
    const parsed = groupInputSchema.safeParse({
      academyId, name, levelId,
      trackId: availableTracks.length ? trackId || null : null,
      capacity: capacity.trim() ? Number(capacity) : null,
      notes: notes.trim() || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form fields.");
      return;
    }
    if (availableTracks.length && !parsed.data.trackId) {
      setError("Choose a track for this level.");
      return;
    }
    if (group) {
      // Edits close the sheet straight away; a server rejection restores the card and reports it.
      const edited = { ...group, name: parsed.data.name, level_id: parsed.data.levelId, track_id: parsed.data.trackId, capacity: parsed.data.capacity, notes: parsed.data.notes };
      const rollback = await patchGroupLists(queryClient, academyId, (groups) => groups.map((item) => (item.id === group.id ? edited : item)));
      onSaved();
      try {
        const result = await updateGroup(group.id, parsed.data);
        if (!result.ok) { rollback(); toast.error(result.message); }
      } catch { rollback(); toast.error("Could not save the group. Please try again."); }
      finally { void queryClient.invalidateQueries({ queryKey: groupsRootKey(academyId) }); }
      return;
    }
    setSaving(true);
    try {
      const result = await createGroup(parsed.data);
      if (!result.ok) { setError(result.message); return; }
      await queryClient.invalidateQueries({ queryKey: groupsRootKey(academyId) });
      if (isCurrentAcademy(academyId)) onSaved();
    } catch {
      setError("Could not save the group. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className={sheetLayout ? "flex min-h-0 flex-1 flex-col" : "flex flex-col gap-5"}>
      <div className={sheetLayout ? "min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-5" : "flex flex-col gap-5"}>
        <Field>
          <FieldLabel htmlFor="group-name">Group name</FieldLabel>
          <Input id="group-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="e.g. Sunday A" required />
        </Field>
        <div className={`grid w-full gap-5 ${hasTracks ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
          <Field className="w-full">
            <FieldLabel>Level</FieldLabel>
            <Select value={levelId} onValueChange={(value) => { setLevelId(value); setTrackId(""); }} disabled={Boolean(programLock)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose a level" /></SelectTrigger>
              <SelectContent>{levels.map((level) => <SelectItem key={level.level_id} value={level.level_id}>{levelNames[level.level_id] ?? level.level_id}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          {levelId && hasTracks && <Field>
            <FieldLabel>Track</FieldLabel>
            <Select value={trackId} onValueChange={setTrackId} disabled={Boolean(programLock) || availableTracks.length === 0}>
              <SelectTrigger className="w-full"><SelectValue placeholder={availableTracks.length ? "Choose a track" : "No track required"} /></SelectTrigger>
              <SelectContent>{availableTracks.map((track) => <SelectItem key={track.id} value={track.id}>{track.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>}
        </div>
        {programLock && <FieldDescription>{programLock}</FieldDescription>}
        <Field>
          <FieldLabel htmlFor="group-capacity">Capacity<span className="text-muted-foreground">(optional)</span></FieldLabel>
          <NumberInput id="group-capacity" min={1} step={1} value={capacity} onChange={(event) => setCapacity(event.target.value)} placeholder="No limit" />
        </Field>
        <Field>
          <div className="flex items-center justify-between w-full">
            <FieldLabel htmlFor="group-notes">Staff notes<span className="text-muted-foreground">(optional)</span></FieldLabel>
            <Tooltip delayDuration={400}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Staff notes visibility information"
                  className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <IconInfoCircle size={16} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                Only academy staff can see these notes.
              </TooltipContent>
            </Tooltip>
          </div>
          <Textarea id="group-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={4} />
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </div>
      <div className={sheetLayout
        ? "grid shrink-0 grid-cols-2 gap-3 border-t bg-popover px-6 py-4"
        : "flex justify-end gap-2 pt-2"}
      >
        <Button type="button" variant="outline" className={sheetLayout ? "w-full" : undefined} onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" className={sheetLayout ? "w-full" : undefined} disabled={saving}>{saving ? "Saving…" : group ? "Save changes" : "Create group"}</Button>
      </div>
    </form>
  );
}
