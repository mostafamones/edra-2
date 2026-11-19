import { useState, type ReactNode } from "react";
import { MathText } from "@/components/shared/math-text";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { staffAcademyHref } from "@/lib/routing";
import { listQuestionBank, readQuestionBank } from "./bank";
import type { BankPayload, BankSummary } from "./bank-contract";

export type BankScope = { academyId: string; academySlug: string; accountId: string };
export const savedBankKey = (scope: BankScope) => ["question-bank", scope.accountId, scope.academyId, "saved"] as const;

export function SavedBank({ scope, disabled, onPick }: {
  scope: BankScope; disabled?: boolean; onPick?: (question: BankPayload, close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" variant="outline" disabled={disabled}>{onPick ? "Add from Question Bank" : "Saved questions"}</Button></DialogTrigger>
    <DialogContent className="max-h-[90svh] w-[calc(100%-1rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Saved questions</DialogTitle>
        <DialogDescription className="sr-only">Open questions saved in this academy’s question bank.</DialogDescription>
      </DialogHeader>
      {open && <SavedQuestions scope={scope} onPick={onPick} close={() => setOpen(false)} />}
    </DialogContent>
  </Dialog>;
}

function SavedQuestions({ scope, onPick, close }: { scope: BankScope; onPick?: (question: BankPayload, close: () => void) => ReactNode; close: () => void }) {
  const [offset, setOffset] = useState(0);
  const [active, setActive] = useState<BankSummary>();
  const page = useQuery({
    queryKey: [...savedBankKey(scope), offset],
    queryFn: async ({ signal }) => {
      const result = await listQuestionBank({ data: { academyId: scope.academyId, offset }, signal });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    }, retry: false,
  });
  const detail = useQuery({
    queryKey: [...savedBankKey(scope), "detail", active?.id],
    queryFn: async ({ signal }) => {
      const result = await readQuestionBank({ data: { academyId: scope.academyId, id: active!.id }, signal });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    }, enabled: !!active, retry: false,
  });
  if (active) return <>
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => setActive(undefined)}>Back to saved questions</Button>
      {active.unitId && <Button asChild size="sm" variant="outline"><a href={staffAcademyHref(scope.academySlug, `/content/${active.unitId}`)}>Open linked unit</a></Button>}
      {active.topic && <Badge variant="secondary" dir="auto">{active.topic}</Badge>}
    </div>
    {detail.isPending && <p role="status" className="text-sm text-muted-foreground">Loading question…</p>}
    {detail.isError && <Alert variant="destructive"><AlertTitle>{detail.error.message}</AlertTitle><Button size="sm" variant="outline" onClick={() => void detail.refetch()}>Retry</Button></Alert>}
    {detail.data && <div className="space-y-3">
      <p className="text-xs text-muted-foreground break-words">{detail.data.source.file} · Page {detail.data.source.page} · Question {detail.data.printedNumber}</p>
      <MathText value={detail.data.prompt} className="block" />
      {detail.data.choices.length > 0 && <ul className="space-y-1">
        {detail.data.choices.map(choice => <li key={choice.key} className="flex items-start gap-2">
          <Badge variant={choice.key === detail.data.answer ? "default" : "outline"}>{choice.key}</Badge>
          <MathText value={choice.text} />
        </li>)}
      </ul>}
      {detail.data.modelAnswer && <section className="space-y-2 border-t pt-3" aria-label="Model answer">
        <h3 className="text-sm font-semibold">Model answer</h3>
        <MathText value={detail.data.modelAnswer} className="block" />
      </section>}
      {detail.data.visuals.map((visual, index) => <figure key={index} className="space-y-2 rounded-lg border p-2">
        <img className="mx-auto max-h-72 max-w-full object-contain" src={visual.image} alt={visual.description} />
        <figcaption dir="auto" className="text-sm text-muted-foreground">{visual.description}</figcaption>
      </figure>)}
      {onPick?.(detail.data, close)}
    </div>}
  </>;
  if (page.isPending) return <p role="status" className="text-sm text-muted-foreground">Loading saved questions…</p>;
  if (page.isError) return <Alert variant="destructive"><AlertTitle>{page.error.message}</AlertTitle><Button size="sm" variant="outline" onClick={() => void page.refetch()}>Retry</Button></Alert>;
  return <>
    {!page.data.rows.length ? <Empty><EmptyHeader><EmptyTitle>No saved questions</EmptyTitle></EmptyHeader></Empty> :
      <ul className="max-h-[60svh] divide-y overflow-y-auto rounded-lg border">
        {page.data.rows.map(row => <li key={row.id}>
          <Button variant="ghost" className="h-auto min-h-12 w-full justify-start p-3 whitespace-normal" onClick={() => setActive(row)}>
            <span className="min-w-0 text-start">
              <MathText value={row.prompt} className="line-clamp-2" />
              {(row.topic || row.unitId) && <span className="block text-xs text-muted-foreground">{row.topic}{row.topic && row.unitId ? " · " : ""}{row.unitId ? "Linked to a unit" : ""}</span>}
            </span>
          </Button>
        </li>)}
      </ul>}
    {(offset > 0 || page.data.more) && <div className="flex justify-between">
      <Button variant="outline" disabled={!offset} onClick={() => setOffset(value => value - 24)}>Previous</Button>
      <Button variant="outline" disabled={!page.data.more} onClick={() => setOffset(value => value + 24)}>Next</Button>
    </div>}
  </>;
}
