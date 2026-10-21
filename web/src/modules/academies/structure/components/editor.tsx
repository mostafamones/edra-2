"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { IconLoader2 } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAcademyScope, useAuth } from "@/modules/auth";
import { GLOBAL_LEVELS, type LevelId } from "../../levels";
import { changeStructure, previewStructureChange } from "../actions";
import { offeringAffectedKeys } from "../query-keys";
import { offeringChangeSchema, type AcademyStructure, type OfferingChange, type OfferingRequest } from "../validation";

type Edit = Extract<OfferingChange, { operation: "add_level" | "add_track" | "rename_track" }>;

export function OfferingEditor({ slug, accountId, academyId, structure, initial, onClose, onCommitted }: {
  slug: string; accountId: string; academyId: string; structure: AcademyStructure; initial: Edit;
  onClose: () => void; onCommitted: (saved: AcademyStructure) => void;
}) {
  const client = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const { user } = useAuth();
  const account = useRef(user?.id);
  useLayoutEffect(() => {
    account.current = user?.id;
    return () => { account.current = undefined; };
  }, [user?.id]);
  const [draft, setDraft] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // An uncertain save keeps its original payload/key; another click retries that same operation.
  const [request, setRequest] = useState<OfferingRequest | null>(null);
  const current = () => isCurrentAcademy(academyId) && account.current === accountId;
  const title = initial.operation === "add_level" ? "Add level" : initial.operation === "add_track" ? "Add track" : "Rename track";
  const available = GLOBAL_LEVELS.filter(level => !structure.levels.some(offered => offered.id === level.id));

  function save() {
    const parsed = offeringChangeSchema.safeParse(draft);
    if (!parsed.success) { setMessage("Enter a track name between 1 and 60 characters."); return; }
    setMessage(null);
    startTransition(async () => {
      try {
        let sending = request;
        if (!sending) {
          const preview = await previewStructureChange(slug, parsed.data);
          if (!current()) return;
          if (!preview.ok) { setMessage(preview.message); return; }
          sending = { change: parsed.data, revision: preview.value.revision, fingerprint: preview.value.fingerprint, requestKey: crypto.randomUUID() };
          setRequest(sending);
        }
        const result = await changeStructure(slug, sending);
        // Always refresh the captured academy's keys, even if the user switched while awaiting.
        if (result.ok && result.value.outcome === "committed") {
          const saved = result.value.structure;
          void Promise.allSettled(offeringAffectedKeys(accountId, academyId).map(queryKey => client.invalidateQueries({ queryKey })));
          if (current()) onCommitted(saved);
          return;
        }
        if (!current()) return;
        if (!result.ok) {
          setMessage(result.message);
          if (result.code !== "unavailable") setRequest(null);
        } else {
          setRequest(null);
          setMessage(result.value.outcome === "conflict" ? "The structure or its records changed. Your entries are preserved. Review them and save again." : "This change has dependencies that must be resolved first.");
        }
      } catch {
        if (current()) setMessage("The save outcome is unknown. Retry to check the same request.");
      }
    });
  }

  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent showCloseButton={!pending} aria-describedby={undefined}>
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <form onSubmit={event => { event.preventDefault(); save(); }} className="flex flex-col gap-5">
        <fieldset disabled={pending || request !== null} className="flex flex-col gap-4">
          {draft.operation === "add_level" ? <Field><FieldLabel htmlFor="offering-level">Level</FieldLabel>
            <Select value={available.some(level => level.id === draft.levelId) ? draft.levelId : ""}
              onValueChange={value => { if (value) setDraft({ ...draft, levelId: value as LevelId }); }}>
              <SelectTrigger id="offering-level" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{available.map(level => <SelectItem key={level.id} value={level.id}>{level.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field> : <Field><FieldLabel htmlFor="offering-track-name">Track name</FieldLabel>
            <Input id="offering-track-name" value={draft.name} dir="auto" required maxLength={60} autoFocus
              onChange={event => setDraft({ ...draft, name: event.target.value })} />
          </Field>}
        </fieldset>
        {message && <FieldError role="alert">{message}</FieldError>}
        <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending || (draft.operation === "add_level" && !available.some(level => level.id === draft.levelId))}>
            {pending && <IconLoader2 className="animate-spin" aria-hidden="true" />}{request ? "Retry save" : "Save"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
