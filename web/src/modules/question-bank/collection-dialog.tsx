import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { newUuid } from "@/lib/uuid";
import { useAcademyScope } from "@/modules/auth";
import { createQuestionBankCollection, renameQuestionBankCollection } from "./bank";
import { bankKeys, type BankScope } from "./queries";

type Target = { kind: "topic" | "custom"; collection?: { id: string; name: string } };
const nouns = { topic: "topic", custom: "collection" };

/** Creates or renames a Topic or Custom collection. */
export function CollectionDialog({ scope, target, trigger }: { scope: BankScope; target: Target; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>{trigger}</DialogTrigger>
    <DialogContent className="w-[calc(100%-1rem)] sm:max-w-md">
      {open && <CollectionForm scope={scope} target={target} close={() => setOpen(false)} />}
    </DialogContent>
  </Dialog>;
}

function CollectionForm({ scope, target, close }: { scope: BankScope; target: Target; close: () => void }) {
  const client = useQueryClient();
  const isCurrent = useAcademyScope();
  // One ID per open dialog keeps an uncertain create retry idempotent.
  const [id] = useState(() => target.collection?.id ?? newUuid());
  const [name, setName] = useState(target.collection?.name ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const noun = nouns[target.kind];
  const title = target.collection ? `Rename ${noun}` : `New ${noun}`;

  async function submit() {
    const value = name.trim();
    if (pending || !value) return;
    const academyId = scope.academyId;
    setPending(true); setError("");
    try {
      const result = target.collection
        ? await renameQuestionBankCollection({ data: { academyId, id, name: value } })
        : await createQuestionBankCollection({ data: { academyId, id, kind: target.kind, name: value } });
      void client.invalidateQueries({ queryKey: bankKeys.collections(scope) });
      if (!isCurrent(academyId)) return;
      if (!result.ok) { setError(result.message); return; }
      close();
    } catch {
      if (isCurrent(academyId)) setError(`Couldn’t save this ${noun}. Try again.`);
    } finally { setPending(false); }
  }

  return <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription className="sr-only">{title}</DialogDescription></DialogHeader>
    <Field><FieldLabel htmlFor="qb-collection-name">Name</FieldLabel>
      <Input id="qb-collection-name" dir="auto" maxLength={120} value={name} autoFocus onChange={event => setName(event.target.value)} aria-invalid={!!error || undefined} />
    </Field>
    {error && <Alert variant="destructive"><AlertTitle>{error}</AlertTitle></Alert>}
    <DialogFooter><Button type="submit" disabled={pending || !name.trim()}>{pending ? "Saving…" : target.collection ? "Rename" : "Create"}</Button></DialogFooter>
  </form>;
}
