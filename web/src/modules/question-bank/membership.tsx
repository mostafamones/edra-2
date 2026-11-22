import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { FolderAddIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAcademyScope } from "@/modules/auth";
import { setQuestionBankMembership } from "./bank";
import type { BankCollection } from "./bank-contract";
import { invalidateMemberships, type BankScope } from "./queries";

/** Adds or removes Topic and Custom memberships. Source memberships and the question itself are never touched. */
export function useMembership(scope: BankScope) {
  const client = useQueryClient();
  const isCurrent = useAcademyScope();
  return async (collectionId: string, questionIds: string[], member: boolean) => {
    const academyId = scope.academyId;
    try {
      const result = await setQuestionBankMembership({ data: { academyId, collectionId, questionIds, member } });
      invalidateMemberships(client, scope, collectionId, questionIds);
      if (!isCurrent(academyId)) return null;
      return result.ok ? undefined : result.message;
    } catch {
      invalidateMemberships(client, scope, collectionId, questionIds);
      return isCurrent(academyId) ? "Couldn’t update the collection. Try again." : null;
    }
  };
}

export function AddToCollection({ scope, collections, questionIds, onDone, label = "Add to collection" }: {
  scope: BankScope; collections: BankCollection[]; questionIds: string[]; onDone?: () => void; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const update = useMembership(scope);
  const choices = collections.filter(collection => collection.kind === "topic" || collection.kind === "custom");
  return <Dialog open={open} onOpenChange={next => { if (!pending) { setOpen(next); setError(""); setTarget(""); } }}>
    <DialogTrigger asChild><Button size="sm" variant="outline" disabled={!questionIds.length}>
      <HugeiconsIcon icon={FolderAddIcon} strokeWidth={1.5} />{label}
    </Button></DialogTrigger>
    <DialogContent className="w-[calc(100%-1rem)] sm:max-w-md">
      <DialogHeader><DialogTitle>Add {questionIds.length === 1 ? "question" : `${questionIds.length} questions`} to a collection</DialogTitle>
        <DialogDescription className="sr-only">Choose a topic or collection.</DialogDescription>
      </DialogHeader>
      {choices.length ? <Field><FieldLabel htmlFor="qb-add-target">Topic or collection</FieldLabel>
        <Select value={target} onValueChange={setTarget} disabled={pending}>
          <SelectTrigger id="qb-add-target" className="w-full"><SelectValue placeholder="Choose" /></SelectTrigger>
          <SelectContent>
            {(["topic", "custom"] as const).map(kind => {
              const items = choices.filter(collection => collection.kind === kind);
              return items.length > 0 && <SelectGroup key={kind}><SelectLabel>{kind === "topic" ? "Topics" : "Collections"}</SelectLabel>
                {items.map(collection => <SelectItem key={collection.id} value={collection.id}><span dir="auto">{collection.name}</span></SelectItem>)}
              </SelectGroup>;
            })}
          </SelectContent>
        </Select>
      </Field> : <p role="status" className="text-sm text-muted-foreground">Create a topic or collection first</p>}
      {error && <Alert variant="destructive"><AlertTitle>{error}</AlertTitle></Alert>}
      <DialogFooter><Button disabled={!target || pending} onClick={async () => {
        setPending(true); setError("");
        const message = await update(target, questionIds, true);
        setPending(false);
        if (message === null) return;
        if (message) { setError(message); return; }
        setOpen(false); setTarget(""); onDone?.();
      }}>{pending ? "Adding…" : "Add"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
