import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadQuestionBankCatalog } from "./bank";
import { maxSaveCount } from "./bank-contract";
import { suggestUnit } from "./unit-match";
import type { TopicGroup } from "./topics";

const unlinked = "unlinked";
export type LinkSelection = { programId: string | null; collectionId: string | null; links: { questionId: string; unitId: string | null }[] };

type Props = {
  academyId: string;
  accountId: string;
  groups: TopicGroup[];
  /** Custom collections the saved questions can optionally join. */
  collections: { id: string; name: string }[];
  disabled: boolean;
  onSave: (selection: LinkSelection) => Promise<string | undefined>;
};

export function AssignUnits({ disabled, ...props }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  return <Dialog open={open} onOpenChange={next => { if (!saving) setOpen(next); }}>
    <DialogTrigger asChild><Button disabled={disabled || !props.groups.length}>Save to bank</Button></DialogTrigger>
    <DialogContent className="max-h-[90svh] w-[calc(100%-1rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Save questions to the bank</DialogTitle>
        <DialogDescription className="sr-only">Select reviewed questions and confirm any links to Library units.</DialogDescription>
      </DialogHeader>
      {open && <AssignmentForm {...props} disabled={disabled} saving={saving} onSave={async value => {
        setSaving(true);
        try {
          const error = await props.onSave(value);
          if (!error) setOpen(false);
          return error;
        } finally { setSaving(false); }
      }} />}
    </DialogContent>
  </Dialog>;
}

function AssignmentForm({ academyId, accountId, groups, collections, disabled, saving, onSave }: Props & { saving: boolean }) {
  const catalog = useQuery({
    queryKey: ["question-bank", accountId, academyId, "catalog"],
    queryFn: async ({ signal }) => {
      const result = await loadQuestionBankCatalog({ data: { academyId }, signal });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    staleTime: 60_000,
    retry: false,
  });
  const [scope, setScope] = useState<string | undefined>();
  const [collection, setCollection] = useState(unlinked);
  const [selected, setSelected] = useState(() => new Set(groups.flatMap(group => group.questions.map(q => q.id)).slice(0, maxSaveCount)));
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const program = catalog.data?.find(item => item.id === scope);
  const hasDestination = (key: string) => Object.hasOwn(destinations, key);
  const destination = (group: TopicGroup) => hasDestination(group.key) ? destinations[group.key] : suggestUnit(group.label, program?.units ?? [])?.id ?? unlinked;
  const linkCount = groups.reduce((total, group) => total + (destination(group) !== unlinked ? group.questions.filter(q => selected.has(q.id)).length : 0), 0);
  const blocked = disabled || saving;

  function toggle(ids: string[], on: boolean) {
    setSelected(previous => {
      const next = new Set(previous);
      ids.forEach(id => { if (!on) next.delete(id); else if (next.size < maxSaveCount) next.add(id); });
      return next;
    });
  }

  return <>
    <Field>
      <FieldLabel htmlFor="qb-program">Library program</FieldLabel>
      <Select value={scope ?? unlinked} disabled={blocked || !catalog.data?.length} onValueChange={value => {
        setScope(value === unlinked ? undefined : value); setDestinations({}); setError("");
      }}>
        <SelectTrigger id="qb-program" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={unlinked}>No program · Save without links</SelectItem>
          {catalog.data?.map(item => <SelectItem key={item.id} value={item.id}>{item.year}–{item.year + 1} · {item.grade}{item.track ? ` · ${item.track}` : " · All tracks"}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
    {collections.length > 0 && <Field>
      <FieldLabel htmlFor="qb-save-collection">Collection</FieldLabel>
      <Select value={collection} disabled={blocked} onValueChange={setCollection}>
        <SelectTrigger id="qb-save-collection" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={unlinked}>None</SelectItem>
          {collections.map(item => <SelectItem key={item.id} value={item.id}><span dir="auto">{item.name}</span></SelectItem>)}
        </SelectContent>
      </Select>
    </Field>}
    {catalog.isPending && <p role="status" className="text-sm text-muted-foreground">Loading Library units…</p>}
    {catalog.isError && <Alert><AlertTitle>{catalog.error.message}</AlertTitle><Button size="sm" variant="outline" onClick={() => void catalog.refetch()}>Reload units</Button></Alert>}
    {program && !program.units.length && <p role="status" className="text-sm text-muted-foreground">No units in this program</p>}
    <ul className="max-h-[48svh] divide-y overflow-y-auto rounded-lg border">
      {groups.map((group, index) => {
        const count = group.questions.filter(q => selected.has(q.id)).length;
        const unit = destination(group);
        const suggested = unit !== unlinked && !hasDestination(group.key);
        return <li key={group.key} className="p-3">
          <Collapsible>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
                <Checkbox checked={count === group.questions.length || (count ? "indeterminate" : false)} disabled={blocked}
                  onCheckedChange={checked => toggle(group.questions.map(q => q.id), checked === true)} />
                <span dir="auto" className="min-w-0 break-words">{group.label ?? "Unassigned"}</span>
              </label>
              <CollapsibleTrigger asChild><Button size="sm" variant="ghost">{count}/{group.questions.length} selected</Button></CollapsibleTrigger>
            </div>
            {program?.units.length ? <Field className="mt-2">
              <FieldLabel htmlFor={`qb-unit-${index}`} className="sr-only">Unit for {group.label ?? "unassigned questions"}</FieldLabel>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Select value={unit} disabled={blocked} onValueChange={value => setDestinations(current => ({ ...current, [group.key]: value }))}>
                  <SelectTrigger id={`qb-unit-${index}`} className="min-w-36 flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={unlinked}>Leave unlinked</SelectItem>
                    {program.units.map(item => <SelectItem key={item.id} value={item.id}><span dir="auto">{item.title} · {item.state === "review" ? "In review" : item.state}</span></SelectItem>)}
                  </SelectContent>
                </Select>
                {suggested && <Badge variant="secondary">Suggested</Badge>}
              </div>
            </Field> : null}
            <CollapsibleContent className="mt-2 space-y-2">
              {group.questions.map(q => <label key={q.id} className="flex items-start gap-2 text-sm">
                <Checkbox checked={selected.has(q.id)} disabled={blocked} onCheckedChange={checked => toggle([q.id], checked === true)} />
                <span dir="auto">{q.prompt}</span>
              </label>)}
            </CollapsibleContent>
          </Collapsible>
        </li>;
      })}
    </ul>
    {error && <Alert variant="destructive"><AlertTitle>{error}</AlertTitle></Alert>}
    <DialogFooter className="items-center">
      <span role="status" className="mr-auto text-sm text-muted-foreground">{selected.size}/{maxSaveCount} selected · {linkCount} linked</span>
      <Button disabled={blocked || !selected.size} onClick={async () => {
        setError("");
        const links = groups.flatMap(group => {
          const unit = destination(group);
          return group.questions.filter(q => selected.has(q.id)).map(q => ({ questionId: q.id, unitId: unit === unlinked ? null : unit }));
        });
        const message = await onSave({ programId: program?.id ?? null, collectionId: collection === unlinked ? null : collection, links });
        if (message) setError(message);
      }}>{saving ? "Saving…" : `Save ${selected.size} ${selected.size === 1 ? "question" : "questions"}`}</Button>
    </DialogFooter>
  </>;
}
