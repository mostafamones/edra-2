import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { PrinterIcon } from "@hugeicons/core-free-icons";
import { QueryContent } from "@/components/shared/query-content";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { couponBatchOptions } from "./queries";
import { PRINT_STATUSES, printCards, printPages, printSignature, type PrintCard, type PrintStatus } from "./pages";
import type { CouponBatch } from "./types";
import "./print.css";

const PRINTING = "coupon-printing";
const STATUS_LABEL = { unused: "Unused", redeemed: "Redeemed", revoked: "Revoked", all: "All" } as const;
type Props = { academyId: string; academyName: string; userId: string; batch: CouponBatch };

/** Print entry point for one batch: an application preview, then the browser print dialog. */
export function CouponPrintDialog({ disabled, ...props }: Props & { disabled: boolean }) {
  return <Dialog>
    <DialogTrigger asChild><Button variant="outline" size="sm" disabled={disabled}><HugeiconsIcon icon={PrinterIcon} strokeWidth={1.5} aria-hidden="true" />Print</Button></DialogTrigger>
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-3xl">
      <PrintPreview key={props.batch.id} {...props} />
    </DialogContent>
  </Dialog>;
}

// Mounted only while the dialog is open, so closing it discards the prepared snapshot and any printable copy.
function PrintPreview({ academyId, academyName, userId, batch }: Props) {
  const [openedAt] = useState(() => Date.now());
  // A fresh authorized read on every open; the batch sheet shares this cache entry.
  const codes = useQuery({ ...couponBatchOptions(userId, academyId, batch.id), refetchOnMount: "always" });
  const [status, setStatus] = useState<PrintStatus>("unused");
  const [phase, setPhase] = useState<"idle" | "checking" | "printing">("idle");
  const [changed, setChanged] = useState(false);
  const alive = useRef(true);
  const printButton = useRef<HTMLButtonElement>(null);
  const finish = useRef(() => {});
  useEffect(() => { alive.current = true; return () => { alive.current = false; finish.current(); }; }, []);
  // A failed or denied read never leaves printable codes on screen.
  const data = codes.error ? undefined : codes.data;
  const cards = data ? printCards(data.codes, status) : [];
  const pages = printPages(cards);
  const verified = Boolean(data) && !codes.isFetching && codes.dataUpdatedAt >= openedAt;

  async function print() {
    const reviewed = printSignature(cards);
    setChanged(false); setPhase("checking");
    const result = await codes.refetch();
    if (!alive.current) return;
    const fresh = result.data && !result.error ? printCards(result.data.codes, status) : null;
    if (!fresh || printSignature(fresh) !== reviewed) { setChanged(Boolean(fresh)); setPhase("idle"); return; }
    await document.fonts?.ready;
    if (!alive.current) return;
    flushSync(() => setPhase("printing"));
    const done = () => {
      document.documentElement.classList.remove(PRINTING); removeEventListener("afterprint", done); finish.current = () => {};
      if (alive.current) { flushSync(() => setPhase("idle")); printButton.current?.focus(); }
    };
    finish.current = done;
    document.documentElement.classList.add(PRINTING);
    addEventListener("afterprint", done);
    try { window.print(); } catch { done(); }
  }

  const busy = phase !== "idle";
  return <>
    <DialogHeader><DialogTitle className="text-lg font-semibold">Print coupons</DialogTitle></DialogHeader>
    <div className="flex flex-wrap items-end gap-3">
      <Field className="w-40">
        <FieldLabel htmlFor="coupon-print-status">Status</FieldLabel>
        <Select value={status} disabled={busy} onValueChange={value => { setStatus(value as PrintStatus); setChanged(false); }}>
          <SelectTrigger id="coupon-print-status"><SelectValue /></SelectTrigger>
          <SelectContent>{PRINT_STATUSES.map(value => <SelectItem key={value} value={value}>{STATUS_LABEL[value]}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      {data && <p role="status" className="pb-2 text-sm text-muted-foreground tabular-nums">{plural(cards.length, "coupon")} · {plural(pages.length, "page")}</p>}
    </div>
    {changed && <Alert role="alert"><AlertDescription>These coupons changed. Review the preview and print again.</AlertDescription></Alert>}
    <div className="-mx-6 min-h-0 flex-1 overflow-y-auto bg-muted/40 px-6 py-4">
      <QueryContent query={{ ...codes, data }} label="coupons" isEmpty={() => cards.length === 0} emptyTitle="No matching coupons">
        {() => <div className="coupon-preview" data-testid="coupon-print-preview"><CouponSheets pages={pages} academyName={academyName} typeName={batch.type_name} /></div>}
      </QueryContent>
    </div>
    <DialogFooter>
      <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
      <Button ref={printButton} disabled={!verified || !cards.length || busy} onClick={() => void print()}>
        <HugeiconsIcon icon={PrinterIcon} strokeWidth={1.5} aria-hidden="true" />{phase === "checking" || (codes.isFetching && !codes.error) ? "Checking…" : "Print"}
      </Button>
    </DialogFooter>
    {phase === "printing" && createPortal(<div className="coupon-print-root" data-testid="coupon-print-document"><CouponSheets pages={pages} academyName={academyName} typeName={batch.type_name} /></div>, document.body)}
  </>;
}

function plural(count: number, noun: string) { return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`; }

/** The shared card renderer for both the preview and the printed document. */
function CouponSheets({ pages, academyName, typeName }: { pages: PrintCard[][]; academyName: string; typeName: string }) {
  return pages.map((page, index) => <section key={index} className="coupon-sheet" aria-label={`Page ${index + 1}`}>
    {page.map(card => <div key={card.id} className="coupon-card">
      <span dir="auto" className="coupon-card-academy">{academyName}</span>
      <span dir="auto" className="coupon-card-type">{typeName}</span>
      <span dir="ltr" className="coupon-card-code">{card.label}</span>
      {card.status !== "unused" && <span className="coupon-card-status">{STATUS_LABEL[card.status]}</span>}
    </div>)}
  </section>);
}
