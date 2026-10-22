"use client";
import { useState } from "react";
import { newUuid } from "@/lib/uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { unwrapContent } from "../types";
import { grantUnitAccess, revokeUnitAccess } from "./actions";
import { learningDate, type AccessRecord } from "./types";

export function GrantDialog({ academyId, unitId, record, kind, defaultDays, revision, onClose, onSaved }: {
  academyId: string; unitId: string; record: AccessRecord; kind: "grant" | "extend" | "revoke"; defaultDays: number; revision: number; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [requestId] = useState(newUuid);
  const [openedAt] = useState(Date.now);
  const [amount, setAmount] = useState("2");
  const [period, setPeriod] = useState("days");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const hours = Number(amount) * (period === "days" ? 24 : 1);
  const validHours = Number.isInteger(hours) && hours > 0 && hours <= 2147483647;
  const previous = record.access.expiresAt ? new Date(record.access.expiresAt).getTime() : 0;
  const preview = kind === "extend" && validHours ? Math.max(previous, openedAt) + hours * 3600000 : openedAt + defaultDays * 86400000;
  const previewDate = Number.isFinite(preview) && preview <= 8640000000000000 ? new Date(preview).toISOString() : null;
  async function confirm() {
    setBusy(true); setError("");
    try {
      if (kind === "revoke") {
        if (!record.access.grantId) throw new Error("Refresh this student's access.");
        unwrapContent(await revokeUnitAccess({ academyId, unitId, recordId: record.id, grantId: record.access.grantId, requestId, reason }));
      } else {
        if (kind === "extend" && !validHours) throw new Error("Enter a valid extension period.");
        unwrapContent(await grantUnitAccess({ academyId, unitId, recordId: record.id, requestId, expectedGrantId: record.access.grantId, expectedRevision: revision,
          ...(kind === "extend" ? { extensionHours: hours } : {}) }));
      }
      await onSaved(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save access."); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent><DialogHeader>
    <DialogTitle>{kind === "grant" ? "Grant unit access" : kind === "extend" ? "Extend unit access" : "Revoke unit access"}</DialogTitle>
    <DialogDescription>{record.name}</DialogDescription>
  </DialogHeader>
    <dl className="grid grid-cols-2 gap-2 text-sm"><dt>Current expiry</dt><dd>{learningDate(record.access.expiresAt)}</dd>
      {kind !== "revoke" && <><dt>New expiry</dt><dd>{learningDate(previewDate)}</dd></>}
      {kind === "grant" && <><dt>Duration</dt><dd>{defaultDays} days</dd></>}
    </dl>
    {kind === "grant" && previous > preview && <Badge variant="destructive">Replaces longer remaining access</Badge>}
    {kind === "extend" && <div className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="extension-amount">Additional time</FieldLabel><Input id="extension-amount" type="number" min={1} step={1} value={amount} disabled={busy} onChange={e => setAmount(e.target.value)} /></Field><Field><FieldLabel>Period</FieldLabel><Select value={period} disabled={busy} onValueChange={setPeriod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="days">Days</SelectItem><SelectItem value="hours">Hours</SelectItem></SelectContent></Select></Field></div>}
    {kind === "revoke" && <Field><FieldLabel htmlFor="revocation-reason">Reason</FieldLabel><Textarea id="revocation-reason" maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} /></Field>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button variant={kind === "revoke" ? "destructive" : "default"} disabled={busy || (kind === "extend" && !validHours) || (kind === "revoke" && !reason.trim())} onClick={confirm}>{busy ? "Saving…" : kind === "grant" ? "Grant access" : kind === "extend" ? "Extend access" : "Revoke access"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
