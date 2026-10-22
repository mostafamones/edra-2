"use client";
import { useRef, useState } from "react";
import { IconCopy, IconDownload, IconPlus, IconX } from "@tabler/icons-react";
import { newUuid } from "@/lib/uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { unwrapContent } from "../types";
import { generateUnitCodes, revokeUnitCode } from "./actions";
import type { AccessWorkspace } from "./types";

function exportCodes(codes: { code: string }[], unitId: string) {
  const blob = new Blob(["unit_id,code\r\n" + codes.map(c => `${unitId},${c.code}`).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = "unit-codes.csv"; link.click(); URL.revokeObjectURL(url);
}
export function UnitCodes({ academyId, unitId, workspace, page, onPage, onChanged }: { academyId: string; unitId: string; workspace: AccessWorkspace; page: number; onPage: (page: number) => void; onChanged: () => Promise<void> }) {
  const [quantity, setQuantity] = useState("1");
  const [generated, setGenerated] = useState<{ code: string }[]>([]);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const request = useRef<{ key: string; id: string } | null>(null);
  function requestId(key: string) { if (request.current?.key !== key) request.current = { key, id: newUuid() }; return request.current!.id; }
  async function generate() {
    const count = Number(quantity);
    if (!Number.isInteger(count) || count < 1 || count > 1000) { setError("Enter between 1 and 1,000 codes."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = unwrapContent(await generateUnitCodes({ academyId, unitId, quantity: count, requestId: requestId(`generate:${count}`) }));
      setGenerated(result.codes); request.current = null; setNotice(`${result.codes.length} codes generated.`); await onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not generate codes."); }
    finally { setBusy(false); }
  }
  async function revoke() {
    if (!revoking) return;
    setBusy(true); setError("");
    try { unwrapContent(await revokeUnitCode({ academyId, unitId, codeId: revoking, requestId: requestId(`revoke:${revoking}`) })); request.current = null; setRevoking(null); setNotice("Code revoked."); await onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not revoke this code."); }
    finally { setBusy(false); }
  }
  async function copy(code: string) { try { await navigator.clipboard.writeText(code); setNotice("Copied."); } catch { setError("Copy failed. Select the code and copy it manually."); } }
  return <Card><CardHeader><CardTitle>Unit codes</CardTitle></CardHeader><CardContent className="space-y-4">
    <div className="flex flex-wrap items-end gap-2"><Field className="max-w-40"><FieldLabel htmlFor="unit-code-quantity">Number of codes</FieldLabel><Input id="unit-code-quantity" type="number" min={1} max={1000} step={1} value={quantity} disabled={busy || !workspace.canIssue} onChange={e => setQuantity(e.target.value)} /></Field><Button disabled={busy || !workspace.canIssue} onClick={generate}><IconPlus />{busy ? "Working…" : "Generate codes"}</Button><Badge variant="secondary">{workspace.defaultDays} days at redemption</Badge></div>
    {generated.length > 0 && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => exportCodes(generated, unitId)}><IconDownload />Export generated codes</Button><Button variant="outline" onClick={() => copy(generated.map(c => c.code).join("\n"))}><IconCopy />Copy generated codes</Button></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    {!workspace.codes.length ? <Empty className="border"><EmptyHeader><EmptyTitle>No unit codes</EmptyTitle></EmptyHeader></Empty> : <><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{workspace.codes.map(code => <TableRow key={code.id}><TableCell className="font-mono text-xs break-all">{code.code}</TableCell><TableCell><Badge variant="secondary">{code.redeemed ? "Redeemed" : code.revoked ? "Revoked" : "Unused"}</Badge></TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label="Copy unit code" onClick={() => copy(code.code)}><IconCopy /></Button>{workspace.manager && <Button variant="ghost" size="icon" aria-label="Revoke unit code" disabled={busy || !workspace.canIssue || code.redeemed || code.revoked} onClick={() => { request.current = null; setRevoking(code.id); }}><IconX /></Button>}</div></TableCell></TableRow>)}</TableBody></Table><div className="flex justify-between gap-2"><Button variant="outline" disabled={busy || page === 0} onClick={() => onPage(page - 1)}>Previous</Button><Button variant="outline" disabled={busy || !workspace.codesHasMore} onClick={() => onPage(page + 1)}>Next</Button></div></>}
    <AlertDialog open={revoking !== null} onOpenChange={open => { if (!open && !busy) setRevoking(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Revoke this unit code?</AlertDialogTitle><AlertDialogDescription>The unused code will no longer grant access.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void revoke(); }}>Revoke code</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </CardContent></Card>;
}
