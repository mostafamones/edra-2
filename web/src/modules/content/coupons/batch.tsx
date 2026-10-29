"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Copy01Icon, Download01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { newUuid } from "@/lib/uuid";
import { copyText } from "@/lib/clipboard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { unwrapContent } from "../types";
import { learningDate } from "../access/types";
import { loadCouponBatch, revokeCoupon } from "./actions";
import { batchProgram, formatCoupon, type CouponBatch } from "./types";

const STATUS_DOT = { unused: "bg-muted-foreground/50", redeemed: "bg-primary", revoked: "bg-destructive" } as const;
const capitalize = (value: string) => value[0].toUpperCase() + value.slice(1);

/** Shows every coupon in one generated batch, with copy, export and revoke. */
export function CouponBatchSheet({ academyId, userId, batch, onClose, onChanged, onCloseAutoFocus }: { academyId: string; userId: string | undefined; batch: CouponBatch | null; onClose: () => void; onChanged: () => Promise<void>; onCloseAutoFocus?: (event: Event) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codes = useQuery({ queryKey: ["content-coupons", userId, academyId, "batch", batch?.id], enabled: Boolean(userId && batch), queryFn: async () => {
    const result = unwrapContent(await loadCouponBatch({ academyId, batchId: batch!.id }));
    if (result.userId !== userId) throw new Error("Your account changed. Reload this page.");
    return result;
  } });
  const labels = codes.data?.codes.map(c => formatCoupon(c.code, c.prefix)) ?? [];
  async function copy(values: string[]) {
    try { await copyText(values.join("\n"), container.current ?? document.body); toast.success("Copied."); }
    catch { toast.error("Copy failed. Select a coupon and copy it manually."); }
  }
  function exportCsv() {
    const blob = new Blob(["coupon,status\r\n" + codes.data!.codes.map((c, i) => `${labels[i]},${c.status}`).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `coupons-${batch!.prefix.toLowerCase()}-${batch!.created_at.slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  async function revoke() {
    if (!revoking || busy) return;
    if (request.current?.key !== revoking) request.current = { key: revoking, id: newUuid() };
    setBusy(true);
    try {
      unwrapContent(await revokeCoupon({ academyId, couponId: revoking, requestId: request.current.id }));
      request.current = null; setRevoking(null); toast.success("Coupon revoked.");
      await Promise.all([codes.refetch(), onChanged()]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not revoke the coupon."); }
    finally { setBusy(false); }
  }
  const canRevoke = Boolean(codes.data?.manager && batch && !batch.closed);
  return <>
    <Sheet open={Boolean(batch)} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent ref={container} onCloseAutoFocus={onCloseAutoFocus} className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        {batch && <SheetHeader>
          <SheetTitle className="text-lg font-semibold">{batch.type_name} · {batch.quantity} coupon{batch.quantity === 1 ? "" : "s"}</SheetTitle>
          <SheetDescription>{batchProgram(batch)} · {learningDate(batch.created_at)}</SheetDescription>
        </SheetHeader>}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          {codes.error && <Alert variant="destructive"><AlertDescription>{codes.error.message}</AlertDescription></Alert>}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!labels.length} onClick={() => copy(labels)}><HugeiconsIcon icon={Copy01Icon} strokeWidth={1.5} aria-hidden="true" />Copy all</Button>
            <Button variant="outline" size="sm" disabled={!labels.length} onClick={exportCsv}><HugeiconsIcon icon={Download01Icon} strokeWidth={1.5} aria-hidden="true" />Export CSV</Button>
          </div>
          {codes.isLoading ? <Skeleton className="h-48 w-full rounded-lg" /> : codes.data && (codes.data.codes.length === 0
            ? <Empty className="min-h-48 rounded-lg border border-dashed"><EmptyHeader><EmptyTitle>No coupons</EmptyTitle></EmptyHeader></Empty>
            : <Table>
            <TableHeader><TableRow><TableHead>Coupon</TableHead><TableHead className="text-center">Redeemed by</TableHead><TableHead className="text-center">Unit</TableHead><TableHead className="text-center">Redeemed</TableHead><TableHead className="text-center"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>{codes.data.codes.map((c, i) => <TableRow key={c.id}>
              <TableCell dir="ltr" className="font-mono text-sm"><span className="flex items-center gap-2"><span aria-hidden="true" title={capitalize(c.status)} className={`size-2 shrink-0 rounded-full ${STATUS_DOT[c.status]}`} />{labels[i]}<span className="sr-only">, {c.status}</span></span></TableCell>
              <TableCell className="text-center"><Truncated value={c.student_name} /></TableCell>
              <TableCell className="text-center"><Truncated value={c.unit_title} /></TableCell>
              <TableCell className="text-center text-muted-foreground tabular-nums">{learningDate(c.redeemed_at)}</TableCell>
              <TableCell><div className="flex justify-center gap-1">
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Copy coupon ${labels[i]}`} onClick={() => copy([labels[i]])}><HugeiconsIcon icon={Copy01Icon} strokeWidth={1.5} /></Button>
                {canRevoke && c.status === "unused" && <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Revoke coupon ${labels[i]}`} disabled={busy} onClick={() => setRevoking(c.id)}><HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} /></Button>}
              </div></TableCell>
            </TableRow>)}</TableBody>
          </Table>)}
        </div>
      </SheetContent>
    </Sheet>
    <AlertDialog open={Boolean(revoking)} onOpenChange={open => { if (!open && !busy) setRevoking(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Revoke this coupon?</AlertDialogTitle><AlertDialogDescription>It will no longer grant unit access.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={e => { e.preventDefault(); void revoke(); }}>Revoke coupon</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}

/** A narrow cell value; the full text shows on hover. */
function Truncated({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <Tooltip>
    <TooltipTrigger asChild><span dir="auto" tabIndex={0} className="mx-auto block max-w-24 truncate">{value}</span></TooltipTrigger>
    <TooltipContent>{value}</TooltipContent>
  </Tooltip>;
}
