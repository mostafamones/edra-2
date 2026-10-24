"use client";

import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, MinusSignIcon, TicketStarIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { newUuid } from "@/lib/uuid";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { unwrapContent } from "../types";
import { generateCoupons } from "./actions";
import { availableCouponTypes, type CouponBatch, type CouponScope, type CouponType } from "./types";
import { ProgramSelect } from "./program-select";

/** Generates one batch for a program and type; retries reuse the request id until the input changes. */
export function GenerateDialog({ academyId, programs, allTypes, onGenerated }: { academyId: string; programs: CouponScope[]; allTypes: CouponType[]; onGenerated: (batch: CouponBatch) => Promise<void> }) {
  const request = useRef<{ key: string; id: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [programId, setProgramId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [quantity, setQuantity] = useState("10");
  const [busy, setBusy] = useState(false);
  const scope = programs.find(p => p.id === programId) ?? programs[0];
  const types = scope ? availableCouponTypes(allTypes, scope) : [];
  // A missing or deleted selection falls back to the default type.
  const selectedType = types.find(t => t.id === typeId) ?? types.find(t => t.isDefault) ?? types[0];
  const count = Math.min(1000, Math.max(1, Number(quantity) || 1));
  // Steps by 5; holding Shift steps by 1.
  function step(event: React.MouseEvent, direction: 1 | -1) { setQuantity(String(Math.min(1000, Math.max(1, count + direction * (event.shiftKey ? 1 : 5))))); }
  function reset(next: boolean) {
    setOpen(next);
    if (!next) { setProgramId(""); setTypeId(""); setQuantity("10"); request.current = null; }
  }
  async function generate() {
    if (!scope || !selectedType || busy) return;
    const key = `${selectedType.id}:${count}`;
    if (request.current?.key !== key) request.current = { key, id: newUuid() };
    setBusy(true);
    try {
      const result = unwrapContent(await generateCoupons({ academyId, yearId: scope.yearId, levelId: scope.levelId, trackId: scope.trackId, typeId: selectedType.virtual ? null : selectedType.id, quantity: count, requestId: request.current.id }));
      toast.success(`${result.codes.length} coupon${result.codes.length === 1 ? "" : "s"} generated.`);
      reset(false);
      await onGenerated({ id: result.batchId, created_at: new Date().toISOString(), prefix: selectedType.prefix, quantity: result.codes.length, type_name: selectedType.name, level: scope.level, track: selectedType.allTracks ? null : scope.track, created_by_name: null, closed: false, redeemed: 0, revoked: 0 });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not generate coupons."); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={next => { if (!busy) reset(next); }}>
      <DialogTrigger asChild><Button disabled={!scope}><HugeiconsIcon icon={TicketStarIcon} strokeWidth={1.5} aria-hidden="true" />Generate coupons</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader><DialogTitle className="text-xl font-bold leading-tight">Generate coupons</DialogTitle></DialogHeader>
        {scope && <div className="grid gap-5">
          <Field><FieldLabel htmlFor="generate-program">Program</FieldLabel><ProgramSelect id="generate-program" programs={programs} value={scope.id} disabled={busy} onChange={value => { setProgramId(value); setTypeId(""); }} /></Field>
          <Field>
            <FieldLabel htmlFor="generate-type">Coupon type</FieldLabel>
            <Select value={selectedType?.id ?? ""} disabled={busy || !types.length} onValueChange={setTypeId}>
              <SelectTrigger id="generate-type" className="w-full"><SelectValue placeholder="No coupon types" /></SelectTrigger>
              <SelectContent>{types.map(t => <SelectItem key={t.id} value={t.id}>{t.name} · {t.prefix}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="generate-quantity">Number of coupons</FieldLabel>
            <form id="generate-form" onSubmit={e => { e.preventDefault(); void generate(); }}>
              <InputGroup className="w-36">
                <InputGroupAddon><InputGroupButton size="icon-xs" aria-label="Decrease" disabled={busy || count <= 1} onClick={e => step(e, -1)}><HugeiconsIcon icon={MinusSignIcon} strokeWidth={1.5} /></InputGroupButton></InputGroupAddon>
                <InputGroupInput id="generate-quantity" inputMode="numeric" className="text-center tabular-nums" value={quantity} disabled={busy} onChange={e => setQuantity(e.target.value.replace(/\D/g, "").slice(0, 4))} onBlur={() => setQuantity(String(count))} />
                <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label="Increase" disabled={busy || count >= 1000} onClick={e => step(e, 1)}><HugeiconsIcon icon={Add01Icon} strokeWidth={1.5} /></InputGroupButton></InputGroupAddon>
              </InputGroup>
            </form>
          </Field>
        </div>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => reset(false)}>Cancel</Button>
          <Button type="submit" form="generate-form" disabled={busy || !selectedType}>{busy ? "Generating…" : "Generate"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
