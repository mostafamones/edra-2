"use client";

import { IconArrowRight, IconTrophy } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { formatScore } from "../score";
import type { Assignment } from "../types";
import { useMarks } from "./use-marks";

const SHOWN = 5;
const percent = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

/** The highest totals so far, with a way into the full student list. */
export function TopStudents({ assignment, onViewAll }: { assignment: Assignment; onViewAll: () => void }) {
  const { query } = useMarks(assignment);
  const top = (query.data?.students ?? [])
    .filter((row) => row.total !== null)
    .sort((a, b) => Number(b.total) - Number(a.total) || a.fullName.localeCompare(b.fullName))
    .slice(0, SHOWN);
  const max = Number(assignment.maxScore);

  return (
    <Card className="h-full gap-0 pb-0">
      <CardHeader className="border-b pb-2! items-center!">
        <CardTitle>Top students</CardTitle>
        <CardAction><Button variant="ghost" size="xs" onClick={onViewAll}>View all<IconArrowRight /></Button></CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-0">
        {query.isPending ? (
          <div className="flex flex-col gap-2 p-4">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-10 rounded-lg" />)}</div>
        ) : top.length === 0 ? (
          <Empty className="flex-1 p-6">
            <EmptyHeader className="gap-1">
              <EmptyMedia variant="icon"><IconTrophy aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>No marks yet</EmptyTitle>
              <EmptyDescription>The highest totals show here as students are marked.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ol className="flex flex-col divide-y">
            {top.map((row, index) => (
              <li key={row.recordId} className="flex items-center gap-3 px-4 py-3">
                <span className="w-5 shrink-0 text-sm font-medium text-muted-foreground tabular-nums">{index + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{row.fullName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[row.studentCode, row.marking === "complete" ? null : "Partly marked"].filter(Boolean).join(" · ") || "No code"}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="text-sm tabular-nums">
                    <span className="font-semibold">{formatScore(row.total!)}</span>
                    <span className="text-muted-foreground"> / {formatScore(assignment.maxScore)}</span>
                  </span>
                  {max > 0 && <span className="text-xs text-muted-foreground tabular-nums">{percent.format((Number(row.total) / max) * 100)}%</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
