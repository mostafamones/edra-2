"use client";

import { IconAlertTriangle, type Icon } from "@tabler/icons-react";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatScore } from "@/lib/score";

export type PartRow = {
  id: string;
  position: number;
  title: string;
  Icon: Icon;
  /** "Edra questions · 3 questions". */
  detail: string;
  maxScore: string;
  /** What still blocks the part; empty once it is complete. */
  issues: string[];
};

/** The parts as list rows: type, size, marks, and (until setup is finished) what still blocks them. */
export function PartsCard({ parts }: { parts: PartRow[] }) {
  return (
    <Card className="h-full gap-0 pb-0">
      <CardHeader className="border-b pb-3!">
        <CardTitle>Parts</CardTitle>
      </CardHeader>
      <ol className="flex flex-col divide-y border-b">
        {parts.map(({ Icon, ...part }) => (
          <li key={part.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="size-4.5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  <span className="mr-2 text-muted-foreground tabular-nums">{part.position}.</span>{part.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">{part.detail}</p>
              </div>
              <p className="shrink-0 text-right text-sm tabular-nums">
                <span className="font-semibold">{formatScore(part.maxScore)}</span>
                <span className="text-muted-foreground"> marks</span>
              </p>
            </div>
            {part.issues.length > 0 && (
              <ul className="flex flex-col gap-1 pl-12 text-xs text-amber-600 dark:text-amber-400">
                {part.issues.map((issue) => (
                  <li key={issue} className="flex items-center gap-1.5">
                    <IconAlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="first-letter:uppercase">{issue}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
