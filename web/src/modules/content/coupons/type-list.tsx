"use client";

import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Cancel01Icon, Delete02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { newUuid } from "@/lib/uuid";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { unwrapContent, type ContentResult } from "../types";
import { changeCouponPrefix, createCouponType, deleteCouponType, renameCouponType } from "./actions";
import { availableCouponTypes, type CouponScope, type CouponType } from "./types";

type ScopedType = CouponType & { virtual?: boolean };

/** Academy coupon types, edited in place: rename, change prefix, delete, or add. */
export function CouponTypeList({ academyId, programs, allTypes, manager, onChanged }: { academyId: string; programs: CouponScope[]; allTypes: CouponType[]; manager: boolean; onChanged: () => Promise<void> }) {
  const scope = programs[0];
  const types = availableCouponTypes(allTypes, scope);
  const [deleting, setDeleting] = useState<ScopedType | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useRef<{ key: string; id: string } | null>(null);
  function requestId(key: string) {
    if (request.current?.key !== key) request.current = { key, id: newUuid() };
    return request.current.id;
  }
  async function run(action: () => Promise<ContentResult<void>>, done: string) {
    setBusy(true);
    try { unwrapContent(await action()); request.current = null; toast.success(done); await onChanged(); return true; }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not update the coupon type."); return false; }
    finally { setBusy(false); }
  }
  async function save(type: ScopedType, name: string, prefix: string) {
    const scopeArgs = { academyId, yearId: scope.yearId, levelId: scope.levelId, trackId: scope.trackId };
    if (!type.virtual && name !== type.name && !await run(() => renameCouponType({ academyId, typeId: type.id, name, requestId: requestId(`rename:${type.id}:${name}`) }), "Type renamed.")) return;
    if (prefix !== type.prefix) await run(() => changeCouponPrefix({ ...scopeArgs, typeId: type.virtual ? null : type.id, prefix, requestId: requestId(`prefix:${type.id}:${prefix}`) }), "Prefix updated.");
  }
  async function create(name: string, prefix: string) {
    const ok = await run(async () => {
      const result = await createCouponType({ academyId, yearId: scope.yearId, name, prefix, requestId: requestId(`create:${scope.id}:${name}:${prefix}`) });
      return result.ok ? { ok: true, value: undefined } : result;
    }, "Coupon type created.");
    if (ok) setAdding(false);
  }
  async function remove() {
    if (!deleting) return;
    if (await run(() => deleteCouponType({ academyId, typeId: deleting.id, requestId: requestId(`delete:${deleting.id}`) }), "Type deleted.")) setDeleting(null);
  }
  // The add button sits in the default row's action column, or the first row without a default.
  const host = types.find(t => t.isDefault) ?? types[0];
  const add = !adding && <Button variant="ghost" size="icon-sm" type="button" className="text-muted-foreground" aria-label="New type" disabled={busy} onClick={() => setAdding(true)}><HugeiconsIcon icon={Add01Icon} strokeWidth={1.5} /></Button>;
  return <>
    <section aria-labelledby="coupon-types-title" className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-2">
        <h2 id="coupon-types-title" className="text-base font-semibold text-foreground/80">Coupon types</h2>
      </div>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-lg bg-card">
        {types.map(type => manager ? <TypeRow key={`${type.id}:${type.name}:${type.prefix}`} type={type} busy={busy} canDelete={!type.virtual && !type.isDefault} onSave={(name, prefix) => save(type, name, prefix)} onDelete={() => setDeleting(type)} action={type === host ? add : undefined} /> : <li key={type.id} className={ROW}><span className="font-medium">{type.name}</span><Badge variant="outline" className="font-mono">{type.prefix}</Badge>{type.isDefault && <Badge variant="secondary">Default</Badge>}</li>)}
        {!types.length && !adding && <li className={ROW}><span className="text-sm text-muted-foreground">No coupon types</span>{manager && <span className="ms-auto flex justify-end">{add}</span>}</li>}
        {manager && adding && <NewTypeRow key={scope.id} busy={busy} onCreate={create} onCancel={() => setAdding(false)} />}
      </ul>
    </section>
    <AlertDialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle><AlertDialogDescription>Issued coupons stay in history. No new coupons can be generated for this type.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={e => { e.preventDefault(); void remove(); }}>Delete type</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

// Fixed columns keep inputs aligned whatever badge or action a row has.
const ROW = "flex flex-wrap items-center gap-2 px-3 py-3";
const NAME = "h-9 w-full min-w-0 sm:h-8 sm:w-64 sm:shrink";
const ICON = "text-muted-foreground";

function TypeRow({ type, busy, canDelete, onSave, onDelete, action }: { type: ScopedType; busy: boolean; canDelete: boolean; onSave: (name: string, prefix: string) => void; onDelete: () => void; action?: React.ReactNode }) {
  const [name, setName] = useState(type.name);
  const [prefix, setPrefix] = useState(type.prefix);
  const dirty = name.trim() !== type.name || prefix !== type.prefix;
  const valid = Boolean(name.trim()) && /^[A-Z]{2,4}$/.test(prefix);
  return <li>
    <form className={ROW} onSubmit={e => { e.preventDefault(); if (dirty && valid) onSave(name.trim(), prefix); }}>
      <InputGroup className={NAME}>
        <InputGroupInput aria-label={`Name of ${type.name}`} maxLength={80} disabled={busy || type.virtual} value={name} onChange={e => setName(e.target.value)} />
        {type.isDefault && <InputGroupAddon align="inline-end"><Badge variant="secondary">Default</Badge></InputGroupAddon>}
      </InputGroup>
      <PrefixInput label={`Prefix of ${type.name}`} value={prefix} disabled={busy} onChange={setPrefix} />
      <span className="ms-auto flex justify-end">{dirty ? <Button size="sm" type="submit" disabled={busy || !valid}>Save</Button> : action ?? (canDelete && <Button variant="ghost" size="icon-sm" type="button" className={ICON} aria-label={`Delete ${type.name}`} disabled={busy} onClick={onDelete}><HugeiconsIcon icon={Delete02Icon} strokeWidth={1.5} /></Button>)}</span>
    </form>
  </li>;
}

function PrefixInput({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <InputGroup className="h-8 w-20 shrink-0"><InputGroupInput aria-label={label} maxLength={4} className="font-mono uppercase" disabled={disabled} value={value} onChange={e => onChange(e.target.value.toUpperCase())} /></InputGroup>;
}

/** An inline row for a new academy type; Escape cancels. */
function NewTypeRow({ busy, onCreate, onCancel }: { busy: boolean; onCreate: (name: string, prefix: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const valid = Boolean(name.trim()) && /^[A-Z]{2,4}$/.test(prefix);
  return <li>
    <form className={ROW} onSubmit={e => { e.preventDefault(); if (valid && !busy) onCreate(name.trim(), prefix); }} onKeyDown={e => { if (e.key === "Escape" && !busy) onCancel(); }}>
      <InputGroup className={NAME}>
        <InputGroupInput aria-label="New type name" maxLength={80} autoFocus disabled={busy} value={name} onChange={e => setName(e.target.value)} />
      </InputGroup>
      <PrefixInput label="New type prefix" value={prefix} disabled={busy} onChange={setPrefix} />
      <span className="ms-auto flex justify-end gap-1">
        <Button variant="ghost" size="icon-sm" type="submit" className={ICON} aria-label="Add type" disabled={busy || !valid}><HugeiconsIcon icon={Tick02Icon} strokeWidth={1.5} /></Button>
        <Button variant="ghost" size="icon-sm" type="button" className={ICON} aria-label="Cancel new type" disabled={busy} onClick={onCancel}><HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} /></Button>
      </span>
    </form>
  </li>;
}
