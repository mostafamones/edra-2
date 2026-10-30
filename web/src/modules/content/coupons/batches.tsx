"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { learningDate } from "../access/types";
import type { CouponBatch } from "./types";

/** The same batch actions as compact cards on small screens and a table on larger screens. */
export function CouponBatches({ batches, onOpen }: { batches: CouponBatch[]; onOpen: (batch: CouponBatch) => void }) {
  const action = (batch: CouponBatch) => <Button variant="ghost" size="sm" aria-label={`Details for ${batch.type_name}`} onClick={() => onOpen(batch)}>Details<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} aria-hidden="true" /></Button>;
  return <>
    <ul className="space-y-3 sm:hidden" aria-label="Coupon batches">
      {batches.map(batch => <li key={batch.id} className="rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p dir="auto" className="break-words font-medium">{batch.type_name}</p><Badge variant="secondary" className="mt-2 font-mono">{batch.prefix}</Badge></div>{action(batch)}</div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Coupons</dt><dd className="mt-1 font-medium tabular-nums">{batch.quantity}</dd></div><div><dt className="text-muted-foreground">Redeemed</dt><dd className="mt-1 font-medium tabular-nums">{batch.redeemed}</dd></div><div className="col-span-2"><dt className="sr-only">Created</dt><dd className="text-xs text-muted-foreground"><time dateTime={batch.created_at}>{learningDate(batch.created_at)}</time></dd></div></dl>
      </li>)}
    </ul>
    <div className="hidden overflow-x-auto sm:block">
      <Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead className="text-right">Coupons</TableHead><TableHead className="text-right">Redeemed</TableHead><TableHead>Created</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
        <TableBody>{batches.map(batch => <TableRow key={batch.id}>
          <TableCell><div className="flex flex-wrap items-center gap-2"><span dir="auto" className="font-medium">{batch.type_name}</span><Badge variant="secondary" className="font-mono">{batch.prefix}</Badge></div></TableCell>
          <TableCell className="text-right tabular-nums">{batch.quantity}</TableCell><TableCell className="text-right tabular-nums">{batch.redeemed}</TableCell>
          <TableCell className="whitespace-nowrap text-muted-foreground"><time dateTime={batch.created_at}>{learningDate(batch.created_at)}</time></TableCell><TableCell className="text-right">{action(batch)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>
  </>;
}
