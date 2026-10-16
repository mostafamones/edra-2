"use client";

import type { ReactNode } from "react";
import { IconAlertTriangle, IconChevronRight, IconCircleCheck, IconPencil } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatScore } from "@/lib/score";
import type { PartSummary } from "./parts-list";

type Props = {
  /** The shown title and instructions of the assessment. */
  title: string;
  instructions: string;
  /** Short facts under the title: due date, audience, timer, totals. */
  facts: { label: string; value: ReactNode }[];
  parts: PartSummary[];
  /** The alert at the top: what is ready, or what blocks the next phase. */
  status: { ready: true; title: string; message: string } | { ready: false; title: string; items: { label: string; detail: string; onClick?: () => void }[] };
  onEditDetails: () => void;
  onEditPart: (index: number) => void;
};

/** The last step: the assessment at a glance, and what is still unfinished. Unfinished setup can always be saved. */
export function ReviewStep({ title, instructions, facts, parts, status, onEditDetails, onEditPart }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {status.ready ? (
        <Alert>
          <IconCircleCheck className="text-primary" />
          <AlertTitle>{status.title}</AlertTitle>
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <IconAlertTriangle className="text-destructive" />
          <AlertTitle>{status.title}</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-0.5">
              {status.items.map((item, position) => (
                <li key={position}>
                  {item.onClick ? (
                    <button type="button" className="text-left underline-offset-4 hover:underline" onClick={item.onClick}>
                      <span className="font-medium text-foreground">{item.label}</span> {item.detail}
                    </button>
                  ) : <><span className="font-medium text-foreground">{item.label}</span> {item.detail}</>}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card className="gap-0 py-0">
        <div className="flex items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <h2 className="truncate font-heading text-xl font-semibold">{title}</h2>
            {instructions && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{instructions}</p>}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onEditDetails}><IconPencil />Edit</Button>
        </div>
        <dl className="grid grid-cols-2 border-t sm:grid-cols-4 [&>div]:p-4 [&>div:not(:last-child)]:border-r max-sm:[&>div:nth-child(2)]:border-r-0 max-sm:[&>div:nth-child(-n+2)]:border-b">
          {facts.map((fact) => (
            <div key={fact.label}><dt className="text-xs text-muted-foreground">{fact.label}</dt><dd className="mt-1 truncate font-medium tabular-nums">{fact.value}</dd></div>
          ))}
        </dl>
      </Card>

      {parts.length > 0 && (
        <Card className="gap-0 py-0">
          <ol className="divide-y">
            {parts.map((part, index) => (
              <li key={index}>
                <button type="button" onClick={() => onEditPart(index)}
                  className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40">
                  <part.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{part.title}</span>
                    <span className="block text-muted-foreground">{part.subtitle}</span>
                  </span>
                  <span className="tabular-nums">{part.max === null ? "—" : formatScore(part.max)} marks</span>
                  {part.unfinished
                    ? <IconAlertTriangle className="size-4 text-destructive" aria-label="Unfinished" />
                    : <IconCircleCheck className="size-4 text-primary" aria-label="Complete" />}
                  <IconChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
