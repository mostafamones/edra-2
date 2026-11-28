import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { QueryContent } from "@/components/shared/query-content";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BankCollection, BankPayload, BankSummary } from "./bank-contract";
import { useBankBrowse } from "./browse";
import { QuestionPreview } from "./preview";
import { BankSearch, QuestionList } from "./question-list";
import { bankDetailOptions, collectionLabel, collectionsOptions, type BankScope } from "./queries";

export type { BankScope } from "./queries";
const all = "all";
const groups: [BankCollection["kind"], string][] = [["topic", "Topics"], ["source_document", "Source documents"], ["source_section", "Source sections"], ["custom", "Collections"]];

/** Saved-question selection for an assessment part. */
export function SavedBank({ scope, disabled, onPick }: {
  scope: BankScope; disabled?: boolean; onPick: (question: BankPayload, close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" variant="outline" disabled={disabled}>Add from Question Bank</Button></DialogTrigger>
    <DialogContent className="flex max-h-[90svh] w-[calc(100%-1rem)] flex-col overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Question bank</DialogTitle>
        <DialogDescription className="sr-only">Choose a saved question to copy into this part.</DialogDescription>
      </DialogHeader>
      {open && <SavedQuestions scope={scope} onPick={onPick} close={() => setOpen(false)} />}
    </DialogContent>
  </Dialog>;
}

function SavedQuestions({ scope, onPick, close }: { scope: BankScope; onPick: (question: BankPayload, close: () => void) => ReactNode; close: () => void }) {
  const browse = useBankBrowse(scope);
  const collections = useQuery(collectionsOptions(scope));
  const [active, setActive] = useState<BankSummary>();
  const detail = useQuery({ ...bankDetailOptions(scope, active?.id ?? ""), enabled: !!active });
  const list = collections.data?.collections ?? [];
  if (active) return <div className="space-y-3">
    <Button size="sm" variant="ghost" onClick={() => setActive(undefined)}><HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.5} />Back to questions</Button>
    <QueryContent query={detail} label="question" isEmpty={() => false} emptyTitle="">
      {data => <QuestionPreview detail={data} collections={list} academySlug={scope.academySlug} actions={onPick(data.payload, close)} />}
    </QueryContent>
  </div>;
  return <div className="flex min-h-0 flex-col gap-3">
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
      <BankSearch browse={browse} id="qb-picker-search" />
      <Select value={browse.collectionId ?? all} onValueChange={value => browse.setCollection(value === all ? null : value)} disabled={!list.length}>
        <SelectTrigger aria-label="Collection" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={all}>All questions</SelectItem>
          {groups.map(([kind, label]) => {
            const items = list.filter(collection => collection.kind === kind);
            return items.length > 0 && <SelectGroup key={kind}><SelectLabel>{label}</SelectLabel>
              {items.map(collection => <SelectItem key={collection.id} value={collection.id}><span dir="auto">{collectionLabel(collection)}</span></SelectItem>)}
            </SelectGroup>;
          })}
        </SelectContent>
      </Select>
    </div>
    <div className="flex max-h-[60svh] min-h-0 flex-col"><QuestionList browse={browse} onOpen={setActive} /></div>
  </div>;
}
