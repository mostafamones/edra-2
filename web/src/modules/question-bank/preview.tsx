import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { MathText } from "@/components/shared/math-text";
import Link from "@/components/shared/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { staffAcademyHref } from "@/lib/routing";
import type { BankCollection, BankDetail } from "./bank-contract";
import { collectionLabel } from "./queries";

const kindLabels: Record<BankCollection["kind"], string> = {
  topic: "Topics", source_document: "Source document", source_section: "Source section", custom: "Collections",
};
const order: BankCollection["kind"][] = ["source_document", "source_section", "topic", "custom"];

/** The full saved question with its source evidence and memberships. */
export function QuestionPreview({ detail, collections, academySlug, onRemove, actions }: {
  detail: BankDetail;
  collections: BankCollection[];
  academySlug: string;
  onRemove?: (collection: BankCollection) => void;
  actions?: ReactNode;
}) {
  const { payload } = detail;
  const byId = new Map(collections.map(collection => [collection.id, collection]));
  const memberships = detail.collections.map(id => byId.get(id)).filter(collection => !!collection);
  const topics = memberships.filter(collection => collection.kind === "topic");
  const pages = [payload.source.page, ...payload.source.continuationPages];
  return <article className="space-y-5" aria-label={`Question ${payload.printedNumber}`}>
    <div className="space-y-3">
      <MathText value={payload.prompt} className="block" />
      {payload.choices.length > 0 && <ul className="space-y-1.5">
        {payload.choices.map(choice => <li key={choice.key} className="flex items-start gap-2">
          <Badge className="mt-0.5 w-7 shrink-0 justify-center" variant={choice.key === payload.answer ? "default" : "outline"}>{choice.key}</Badge>
          <MathText value={choice.text} />
        </li>)}
      </ul>}
      {payload.choices.length > 0 && <p className="text-sm text-muted-foreground">{payload.answer ? `Confirmed answer: ${payload.answer}` : "No answer confirmed"}</p>}
    </div>
    {payload.modelAnswer && <section className="space-y-2 border-t pt-3" aria-label="Model answer">
      <h3 className="text-sm font-semibold">Model answer</h3>
      <MathText value={payload.modelAnswer} className="block" />
    </section>}
    {payload.visuals.map((visual, index) => <figure key={index} className="space-y-2 rounded-lg border p-2">
      <img className="mx-auto max-h-72 max-w-full rounded-sm bg-white object-contain" src={visual.image} alt={visual.description} />
      <figcaption dir="auto" className="text-sm text-muted-foreground">{visual.description} · p. {visual.page}</figcaption>
    </figure>)}
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t pt-3 text-sm">
      <dt className="text-muted-foreground">File</dt><dd className="break-words" dir="auto">{payload.source.file}</dd>
      <dt className="text-muted-foreground">{pages.length > 1 ? "Pages" : "Page"}</dt><dd>{pages.join(", ")}</dd>
      <dt className="text-muted-foreground">Question</dt><dd dir="auto">{payload.printedNumber}</dd>
      {payload.section && <><dt className="text-muted-foreground">Printed section</dt><dd dir="auto" className="break-words">{payload.section}</dd></>}
      {payload.answerSource && <><dt className="text-muted-foreground">Answer source</dt><dd className="break-words" dir="auto">{payload.answerSource.file} · p. {payload.answerSource.page}</dd></>}
      {!topics.length && payload.topic && <><dt className="text-muted-foreground">Imported topic</dt><dd dir="auto" className="break-words">{payload.topic}</dd></>}
      {detail.unitId && <><dt className="text-muted-foreground">Library unit</dt><dd>
        <Link className="inline-flex items-center gap-1 underline-offset-4 hover:underline" href={staffAcademyHref(academySlug, `/content/${detail.unitId}`)}>
          Open linked unit<HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.5} className="size-4" />
        </Link>
      </dd></>}
    </dl>
    {memberships.length > 0 && <div className="space-y-2 border-t pt-3">
      {order.map(kind => {
        const items = memberships.filter(collection => collection.kind === kind);
        return items.length > 0 && <div key={kind} className="flex flex-wrap items-center gap-1.5">
          <span className="me-1 text-xs text-muted-foreground">{kindLabels[kind]}</span>
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
        </div>;
      })}
    </div>}
    {actions}
  </article>;
}
