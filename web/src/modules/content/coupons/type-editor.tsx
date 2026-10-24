"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { newUuid } from "@/lib/uuid";
import { unwrapContent } from "../types";
import { updateCouponType } from "./actions";
import type { AvailableCouponType, CouponScope } from "./types";

export function CouponTypeEditor({ academyId, scope, type, onClose, onSaved }: { academyId: string; scope: CouponScope; type: AvailableCouponType; onClose: () => void; onSaved: () => Promise<void> }) {
  const originalPrefix = type.prefix.split("-").at(-1) ?? type.prefix;
  const [name, setName] = useState(type.name), [prefix, setPrefix] = useState(originalPrefix);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const request = useRef<{ key: string; id: string } | null>(null);
  async function save() {
    if (busy) return;
    setBusy(true); setError("");
    const key = `${name.trim()}:${prefix.trim().toUpperCase()}`;
    if (request.current?.key !== key) request.current = { key, id: newUuid() };
    try {
      unwrapContent(await updateCouponType({ academyId, yearId: scope.yearId, levelId: scope.levelId, trackId: scope.trackId, typeId: type.virtual ? null : type.id, name, prefix, requestId: request.current.id }));
      await onSaved(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save this coupon type."); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>Edit coupon type</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
    <div className="space-y-2"><Label htmlFor="edit-coupon-name">Name</Label><Input id="edit-coupon-name" maxLength={80} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></div>
    <div className="space-y-2"><Label htmlFor="edit-coupon-prefix">Type prefix</Label><Input id="edit-coupon-prefix" maxLength={4} value={prefix} disabled={busy} onChange={event => setPrefix(event.target.value.toUpperCase())} /></div>
    <div className="rounded-lg bg-muted/50 p-3 font-mono text-sm">{type.prefix.includes("-") ? type.prefix.slice(0, type.prefix.lastIndexOf("-") + 1) : `${scope.prefix ?? ""}${scope.prefix ? "-" : ""}`}{prefix}-XXXX-XXXX</div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !name.trim() || !/^[A-Z]{2,4}$/.test(prefix) || (name.trim() === type.name && prefix === originalPrefix)}>{busy ? "Saving…" : "Save changes"}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}
