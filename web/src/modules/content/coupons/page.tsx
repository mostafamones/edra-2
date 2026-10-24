"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Download01Icon, Cancel01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { AcademyGate, useAuth } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { newUuid } from "@/lib/uuid";
import { copyText } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { unwrapContent } from "../types";
import { learningDate } from "../access/types";
import { changeCouponPrefix, createCouponType, generateCoupons, loadCouponOptions, loadCoupons, revokeCoupon } from "./actions";
import { availableCouponTypes, formatCoupon, scopeLabel } from "./types";

export function CouponsPage() {
  const { user } = useAuth();
  return <AcademyGate>{academy => <CouponWorkspace key={`${academy.id}:${user?.id}`} academy={academy} />}</AcademyGate>;
}

function CouponWorkspace({ academy }: { academy: AcademyEntry }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const container = useRef<HTMLDivElement>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  const [programId, setProgramId] = useState("");
  const [typeId, setTypeId] = useState("default");
  const [typeName, setTypeName] = useState("");
  const [typePrefix, setTypePrefix] = useState("");
  const [allTracks, setAllTracks] = useState(true);
  const [editedPrefix, setEditedPrefix] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [generated, setGenerated] = useState<string[]>([]);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const rootKey = ["content-coupons", user?.id, academy.id];
  const options = useQuery({ queryKey: [...rootKey, "options"], enabled: Boolean(user), queryFn: async () => {
    const result = unwrapContent(await loadCouponOptions({ academyId: academy.id }));
    if (result.userId !== user?.id) throw new Error("Your account changed. Reload this page.");
    return result;
  } });
  const scope = options.data?.programs.find(p => p.id === programId) ?? options.data?.programs.find(p => !p.closed) ?? options.data?.programs[0];
  const types = scope ? availableCouponTypes(options.data?.types ?? [], scope) : [];
  const selectedType = types.find(t => typeId === "default" ? t.isDefault : t.id === typeId);
  const codes = useQuery({ queryKey: [...rootKey, "codes", scope?.id, selectedType?.id, status, search, page], enabled: Boolean(user && scope), queryFn: async () => {
    const result = unwrapContent(await loadCoupons({ academyId: academy.id, yearId: scope!.yearId, levelId: scope!.levelId, trackId: scope!.trackId, typeId: selectedType?.virtual ? null : selectedType?.id ?? null, status, search, page }));
    if (result.userId !== user?.id) throw new Error("Your account changed. Reload this page.");
    return result;
  } });
  function requestId(key: string) {
    if (request.current?.key !== key) request.current = { key, id: newUuid() };
    return request.current!.id;
  }
  async function refresh() { await cache.invalidateQueries({ queryKey: rootKey }); }
  async function mutate(kind: "type" | "generate" | "revoke" | "prefix") {
    if (!scope || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (kind === "type") {
        const result = unwrapContent(await createCouponType({ academyId: academy.id, yearId: scope.yearId, levelId: scope.levelId, trackId: scope.trackId, name: typeName, prefix: typePrefix, allTracks: !scope.trackId || allTracks, requestId: requestId(`type:${scope.id}:${typeName.trim()}:${typePrefix}:${!scope.trackId || allTracks}`) }));
        setTypeId(result.id); setTypeName(""); setTypePrefix(""); setNotice("Coupon type created.");
      } else if (kind === "prefix") {
        if (!selectedType) throw new Error("Choose a coupon type.");
        const prefix = editedPrefix ?? selectedType.prefix;
        unwrapContent(await changeCouponPrefix({ academyId: academy.id, yearId: scope.yearId, levelId: scope.levelId, trackId: scope.trackId, typeId: selectedType.virtual ? null : selectedType.id, prefix, requestId: requestId(`prefix:${selectedType.id}:${prefix}`) }));
        setEditedPrefix(null); setNotice("Prefix updated.");
      } else if (kind === "generate") {
        if (!selectedType) throw new Error("Choose a coupon type.");
        const result = unwrapContent(await generateCoupons({ academyId: academy.id, yearId: scope.yearId, levelId: scope.levelId, trackId: scope.trackId, typeId: selectedType.virtual ? null : selectedType.id, quantity: Number(quantity), requestId: requestId(`generate:${selectedType.id}:${quantity}`) }));
        setGenerated(result.codes.map(c => formatCoupon(c.code, c.prefix))); setPage(0); setStatus("all"); setSearch(""); setNotice(`${result.codes.length} coupon${result.codes.length === 1 ? "" : "s"} generated.`);
      } else if (revoking) {
        unwrapContent(await revokeCoupon({ academyId: academy.id, couponId: revoking, requestId: requestId(`revoke:${revoking}`) }));
        setRevoking(null); setNotice("Coupon revoked.");
      }
      request.current = null;
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update coupons."); }
    finally { setBusy(false); }
  }
  async function copy(values: string[]) {
    setError(""); setNotice("");
    try { await copyText(values.map(value => formatCoupon(value)).join("\n"), container.current ?? document.body); setNotice("Copied."); }
    catch { setError("Copy failed. Select a coupon and copy it manually."); }
  }
  function exportGenerated() {
    const blob = new Blob(["coupon\r\n" + generated.map(value => formatCoupon(value)).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = "coupons.csv"; link.click(); URL.revokeObjectURL(url);
  }
  const queryError = options.error ?? codes.error;
  return <main ref={container} className="page-shell min-w-0">
    <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Coupons</h1><Button variant="outline" size="icon" aria-label="Refresh coupons" onClick={() => refresh()}><HugeiconsIcon icon={RefreshIcon} strokeWidth={1.5} /></Button></div>
    {options.isLoading ? <Skeleton className="h-32 w-full" /> : !scope ? <Empty className="border"><EmptyHeader><EmptyTitle>No academic scopes</EmptyTitle></EmptyHeader></Empty> : <>
      <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="coupon-scope">Academic scope</Label><Select value={scope.id} onValueChange={value => { setProgramId(value); setTypeId("default"); setEditedPrefix(null); setPage(0); setGenerated([]); }}><SelectTrigger id="coupon-scope" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{options.data?.programs.map(p => <SelectItem key={p.id} value={p.id}>{scopeLabel(p)}{p.closed ? " · Closed" : ""}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="coupon-type">Coupon type</Label><Select value={selectedType?.id ?? "all"} onValueChange={value => { setTypeId(value === "all" ? "" : value); setEditedPrefix(null); setPage(0); setGenerated([]); }}><SelectTrigger id="coupon-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{types.map(t => <SelectItem key={t.id} value={t.id}>{t.name} · {t.prefix}{t.allTracks ? " · All tracks" : ""}{t.isDefault ? " · Default" : ""}</SelectItem>)}</SelectContent></Select></div>
        <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); void mutate("type"); }}><div className="flex-1 space-y-2"><Label htmlFor="coupon-type-name">New type</Label><Input id="coupon-type-name" maxLength={80} value={typeName} disabled={busy || scope.closed} onChange={e => setTypeName(e.target.value)} /></div><div className="w-24 space-y-2"><Label htmlFor="new-type-prefix">Prefix</Label><Input id="new-type-prefix" maxLength={4} value={typePrefix} disabled={busy || scope.closed} onChange={e => setTypePrefix(e.target.value.toUpperCase())} /></div><Button type="submit" variant="outline" disabled={busy || scope.closed || !typeName.trim() || !/^[A-Z]{2,4}$/.test(typePrefix)}>Create type</Button><div className="flex w-full items-center gap-2"><Checkbox id="coupon-all-tracks" disabled={busy || scope.closed || !scope.trackId} checked={!scope.trackId || allTracks} onCheckedChange={value => setAllTracks(value === true)} /><Label htmlFor="coupon-all-tracks">All tracks in this grade</Label></div></form>
        <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); void mutate("generate"); }}><div className="flex-1 space-y-2"><Label htmlFor="coupon-quantity">Number of coupons</Label><Input id="coupon-quantity" type="number" min={1} max={1000} value={quantity} disabled={busy || scope.closed} onChange={e => setQuantity(e.target.value)} /></div><Button type="submit" disabled={busy || scope.closed || !selectedType}>Generate coupons</Button></form>
      </div>
      {selectedType && <form className="flex max-w-md items-end gap-2" onSubmit={e => { e.preventDefault(); void mutate("prefix"); }}><div className="flex-1 space-y-2"><Label htmlFor="selected-type-prefix">{selectedType.name} prefix</Label><Input id="selected-type-prefix" maxLength={4} disabled={busy || scope.closed} value={editedPrefix ?? selectedType.prefix} onChange={e => setEditedPrefix(e.target.value.toUpperCase())} /></div><Button variant="outline" type="submit" disabled={busy || scope.closed || editedPrefix === null || !/^[A-Z]{2,4}$/.test(editedPrefix)}>Save prefix</Button></form>}
      {generated.length > 0 && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => copy(generated)}><HugeiconsIcon icon={Copy01Icon} strokeWidth={1.5} />Copy generated coupons</Button><Button variant="outline" onClick={exportGenerated}><HugeiconsIcon icon={Download01Icon} strokeWidth={1.5} />Export generated coupons</Button></div>}
      <div className="flex flex-wrap gap-2"><Input type="search" aria-label="Search coupons" className="max-w-sm" maxLength={100} value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /><Select value={status} onValueChange={value => { setStatus(value); setPage(0); }}><SelectTrigger aria-label="Coupon status" className="w-40"><SelectValue /></SelectTrigger><SelectContent>{["all", "unused", "redeemed", "revoked"].map(s => <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent></Select></div>
      {codes.isLoading ? <Skeleton className="h-40 w-full" /> : !codes.data?.codes.length ? <Empty className="border"><EmptyHeader><EmptyTitle>{search || status !== "all" ? "No matching coupons" : "No coupons"}</EmptyTitle></EmptyHeader></Empty> : <div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead>Coupon</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Redeemed by</TableHead><TableHead>Unit</TableHead><TableHead>Redeemed at</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{codes.data.codes.map(c => <TableRow key={c.id}><TableCell className="font-mono">{formatCoupon(c.code, c.prefix)}</TableCell><TableCell>{c.type_name}</TableCell><TableCell><Badge variant="secondary">{c.status[0].toUpperCase() + c.status.slice(1)}</Badge></TableCell><TableCell>{c.student_name ?? "—"}</TableCell><TableCell>{c.unit_title ?? "—"}</TableCell><TableCell>{learningDate(c.redeemed_at)}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon-sm" aria-label={`Copy coupon ${formatCoupon(c.code, c.prefix)}`} onClick={() => copy([formatCoupon(c.code, c.prefix)])}><HugeiconsIcon icon={Copy01Icon} strokeWidth={1.5} /></Button>{codes.data?.manager && c.status === "unused" && <Button variant="ghost" size="icon-sm" aria-label={`Revoke coupon ${formatCoupon(c.code, c.prefix)}`} disabled={busy || scope.closed} onClick={() => setRevoking(c.id)}><HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} /></Button>}</div></TableCell></TableRow>)}</TableBody></Table></div>}
      {(page > 0 || codes.data?.hasMore) && <div className="flex justify-end gap-2"><Button variant="outline" disabled={page === 0 || codes.isFetching} onClick={() => setPage(p => p - 1)}>Previous</Button><Button variant="outline" disabled={!codes.data?.hasMore || codes.isFetching} onClick={() => setPage(p => p + 1)}>Next</Button></div>}
    </>}
    {(error || queryError) && <p role="alert" className="text-sm text-destructive">{error || queryError?.message}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    <AlertDialog open={Boolean(revoking)} onOpenChange={open => { if (!open && !busy) setRevoking(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Revoke this coupon?</AlertDialogTitle><AlertDialogDescription>It will no longer grant unit access.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void mutate("revoke"); }}>Revoke coupon</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}
