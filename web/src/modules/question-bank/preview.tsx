import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, CheckmarkCircle02Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { MathText } from "@/components/shared/math-text";
import Link from "@/components/shared/link";
import { SectionHeader } from "@/components/shared/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { staffAcademyHref } from "@/lib/routing";
import { cn } from "@/lib/utils";
import type { BankCollection, BankDetail } from "./bank-contract";
import { collectionLabel, fileTitle, questionTitle } from "./queries";

const kindLabels: Record<BankCollection["kind"], string> = {
  topic: "Topics", source_document: "Document", source_section: "Section", custom: "Collections",
};
const order: BankCollection["kind"][] = ["source_document", "source_section", "topic", "custom"];

function Block({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-2.5" aria-label={title}>
    <SectionHeader title={title} />
    {children}
  </section>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-baseline justify-between gap-4 py-2">
    <dt className="shrink-0 text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words text-end" dir="auto">{children}</dd>
  </div>;
}

/** The full saved question with its source evidence and memberships. */
export function QuestionPreview({ detail, collections, academySlug, onRemove, onAnswer, actions }: {
  detail: BankDetail;
  collections: BankCollection[];
  academySlug: string;
  onRemove?: (collection: BankCollection) => void;
  /** Makes each choice a control that confirms it as the answer. */
  onAnswer?: (key: string | null) => void;
  actions?: ReactNode;
}) {
  const { payload } = detail;
  const byId = new Map(collections.map(collection => [collection.id, collection]));
  const memberships = detail.collections.map(id => byId.get(id)).filter(collection => !!collection);
  const topics = memberships.filter(collection => collection.kind === "topic");
  const pages = [payload.source.page, ...payload.source.continuationPages];
  return <article className="space-y-7" aria-label={questionTitle(payload.printedNumber)}>
    <div className="space-y-4">
      <MathText value={payload.prompt} className="block text-base leading-7" />
      {payload.choices.length > 0 && <ul className="space-y-2">
        {payload.choices.map(choice => {
          const correct = choice.key === payload.answer;
          const body = <>
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md border text-xs font-medium uppercase", correct && "border-primary bg-primary text-primary-foreground")}>{choice.key}</span>
            <MathText value={choice.text} className="min-w-0 flex-1 leading-normal" />
            {correct && <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.5} className="size-5 shrink-0 text-primary" aria-label="Correct answer" />}
          </>;
          const frame = cn("flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-start", correct && "border-primary/50 bg-primary/5");
          return <li key={choice.key}>
            {onAnswer
              ? <button type="button" aria-pressed={correct} aria-label={`Choice ${choice.key}${correct ? ", the confirmed answer" : ""}`}
                  className={cn(frame, "outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50", !correct && "hover:bg-muted/50")}
                  onClick={() => { if (!correct) onAnswer(choice.key); }}>{body}</button>
              : <div className={frame}>{body}</div>}
          </li>;
        })}
      </ul>}
      {payload.choices.length > 0 && <div className="flex h-8 items-center justify-end">
        {!payload.answer
          ? <p role="status" className="text-sm text-muted-foreground">No answer confirmed</p>
          : onAnswer && <Button type="button" variant="ghost" size="sm" className="-me-2 text-muted-foreground" onClick={() => onAnswer(null)}>
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} />Clear answer
          </Button>}
      </div>}
    </div>

    {payload.modelAnswer && <Block title="Model answer">
      <MathText value={payload.modelAnswer} className="block rounded-lg bg-muted/50 p-3" />
    </Block>}

    {payload.visuals.length > 0 && <Block title="Figures">
      {payload.visuals.map((visual, index) => <figure key={index} className="space-y-2 rounded-lg border p-2">
        <img className="mx-auto max-h-72 max-w-full rounded-sm bg-white object-contain" src={visual.image} alt={visual.description} />
        <figcaption dir="auto" className="text-xs text-muted-foreground">{visual.description} · Page {visual.page}</figcaption>
      </figure>)}
    </Block>}

    <Block title="Source">
      <div className="rounded-lg border text-sm">
        <dl className="grid grid-cols-[minmax(0,1fr)_auto_auto] divide-x">
          {[["File", fileTitle(payload.source.file)], [pages.length > 1 ? "Pages" : "Page", pages.join(", ")], ["Question", payload.printedNumber]].map(([label, value]) =>
            <div key={label} className="min-w-0 space-y-0.5 px-3 py-2.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="break-words font-medium" dir="auto">{value}</dd>
            </div>)}
        </dl>
        {(payload.section || payload.answerSource || (!topics.length && payload.topic) || detail.unitId) && <dl className="divide-y border-t px-3">
          {payload.section && <Row label="Section">{payload.section}</Row>}
          {payload.answerSource && <Row label="Answer source">{fileTitle(payload.answerSource.file)} · Page {payload.answerSource.page}</Row>}
          {!topics.length && payload.topic && <Row label="Imported topic">{payload.topic}</Row>}
          {detail.unitId && <Row label="Library unit">
            <Link className="inline-flex items-center gap-1 underline-offset-4 hover:underline" href={staffAcademyHref(academySlug, `/content/${detail.unitId}`)}>
              Open linked unit<HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.5} className="size-4" />
            </Link>
          </Row>}
        </dl>}
      </div>
    </Block>
    {memberships.length > 0 && <Block title="Belongs to">
      <dl className="space-y-2 text-sm">
        {order.map(kind => {
          const items = memberships.filter(collection => collection.kind === kind);
          return items.length > 0 && <div key={kind} className="flex items-start gap-3">
            <dt className="w-24 shrink-0 pt-0.5 text-muted-foreground">{kindLabels[kind]}</dt>
            <dd className="flex min-w-0 flex-wrap gap-1.5">
              {items.map(collection => <Badge key={collection.id} variant="secondary" className="max-w-full gap-1">
                <span dir="auto" className="truncate">{collectionLabel(collection)}</span>
                {onRemove && (kind === "topic" || kind === "custom") && <Tooltip>
                  <TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-xs" className="-me-1 size-4"
                    aria-label={`Remove from ${collection.name}`} onClick={() => onRemove(collection)}>
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} />
                  </Button></TooltipTrigger>
                  <TooltipContent>Remove from {collection.name}</TooltipContent>
                </Tooltip>}
              </Badge>)}
            </dd>
          </div>;
        })}
      </dl>
    </Block>}
    {actions}
  </article>;
}
