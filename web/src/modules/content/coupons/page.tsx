"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Copy01Icon, Download01Icon, Cancel01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { AcademyGate, useAuth } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { newUuid } from "@/lib/uuid";
import { copyText } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { unwrapContent } from "../types";
import { learningDate } from "../access/types";
import { createCouponType, removeCouponType, generateCoupons, loadCouponOptions, loadCoupons, revokeCoupon } from "./actions";
import { availableCouponTypes, couponTypeGroups, defaultCouponType, formatCoupon, scopeLabel, type AvailableCouponType } from "./types";

import { CouponTypeEditor } from "./type-editor";
import { CouponTypeCatalog } from "./type-catalog";

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
  const [typeId, setTypeId] = useState("");
  const [generationTypeId, setGenerationTypeId] = useState("");
  const [typeName, setTypeName] = useState("");
  const [typePrefix, setTypePrefix] = useState("");
  const [prefixEdited, setPrefixEdited] = useState(false);
  const [editingType, setEditingType] = useState<AvailableCouponType | null>(null);
  const [creatingType, setCreatingType] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [removingType, setRemovingType] = useState<AvailableCouponType | null>(null);
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
  const effectiveDefault = defaultCouponType(types);
  const selectedType = typeId === "default" ? effectiveDefault : types.find(type => type.id === typeId);
  const generationType = types.find(type => type.id === generationTypeId) ?? selectedType ?? effectiveDefault;
  const codes = useQuery({ queryKey: [...rootKey, "codes", scope?.id, selectedType?.id, status, search, page], enabled: Boolean(user && scope && !options.isError), queryFn: async () => {
    const result = unwrapContent(await loadCoupons({ academyId: academy.id, yearId: scope!.yearId, levelId: scope!.levelId, trackId: scope!.trackId, typeId: selectedType?.virtual ? null : selectedType?.id ?? null, status, search, page }));
    if (result.userId !== user?.id) throw new Error("Your account changed. Reload this page.");
    return result;
  } });
  function requestId(key: string) {
    if (request.current?.key !== key) request.current = { key, id: newUuid() };
    return request.current!.id;
  }
  async function refresh() { await Promise.all([cache.invalidateQueries({ queryKey: rootKey }), cache.invalidateQueries({ queryKey: ["content-requirements", user?.id, academy.id] })]); }
  async function mutate(kind: "type" | "generate" | "revoke") {
    if (!scope || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (kind === "type") {
        const result = unwrapContent(await createCouponType({ academyId: academy.id, yearId: scope.yearId, levelId: scope.levelId, trackId: scope.trackId, name: typeName, prefix: typePrefix, requestId: requestId(`type:${scope.id}:${typeName.trim()}:${typePrefix}`) }));
        setTypeId(result.id); setTypeName(""); setTypePrefix(""); setPrefixEdited(false); setCreatingType(false); setNotice("Coupon type created.");
      } else if (kind === "generate") {
        if (!generationType) throw new Error("Choose a coupon type.");
        const result = unwrapContent(await generateCoupons({ academyId: academy.id, yearId: scope.yearId, levelId: scope.levelId, trackId: scope.trackId, typeId: generationType.virtual ? null : generationType.id, quantity: Number(quantity), requestId: requestId(`generate:${generationType.id}:${quantity}`) }));
        setTypeId(generationType.virtual ? "default" : generationType.id); setGenerated(result.codes.map(c => formatCoupon(c.code, c.prefix))); setGenerating(false); setPage(0); setStatus("all"); setSearch(""); setNotice(`${result.codes.length} coupon${result.codes.length === 1 ? "" : "s"} generated.`);
      } else if (revoking) {
        unwrapContent(await revokeCoupon({ academyId: academy.id, couponId: revoking, requestId: requestId(`revoke:${revoking}`) }));
        setRevoking(null); setNotice("Coupon revoked.");
      }
      request.current = null;
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update coupons."); }
    finally { setBusy(false); }
  }
  async function removeType() {
    if (!removingType || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = unwrapContent(await removeCouponType({ academyId: academy.id, typeId: removingType.id, requestId: requestId(`remove-type:${removingType.id}`) }));
      request.current = null; setRemovingType(null); setTypeId("default"); setNotice(`Coupon type ${result.mode}.`); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove this coupon type."); }
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
  const queryError = options.isError ? null : codes.error;
  return <main ref={container} className="page-shell min-w-0">
    <div className="flex items-center justify-between gap-3"><h1 className="font-heading text-2xl font-semibold">Coupons</h1><Button variant="ghost" size="icon" aria-label="Refresh coupons" onClick={() => refresh()}><HugeiconsIcon icon={RefreshIcon} strokeWidth={1.5} /></Button></div>
    {options.isLoading ? <Skeleton className="h-32 w-full" /> : options.isError ? <Alert variant="destructive" role="alert"><AlertTitle>Couldn’t load coupons</AlertTitle><AlertDescription>{options.error.message}<Button variant="outline" size="sm" disabled={options.isFetching} onClick={() => options.refetch()}>Retry</Button></AlertDescription></Alert> : !scope ? <Empty className="border"><EmptyHeader><EmptyTitle>No academic scopes</EmptyTitle></EmptyHeader></Empty> : <>
      <div className="max-w-xl">
        <div className="space-y-2"><Label htmlFor="coupon-scope">Audience</Label><Select value={scope.id} onValueChange={value => { setProgramId(value); setTypeId(""); setGenerationTypeId(""); setPage(0); setGenerated([]); }}><SelectTrigger id="coupon-scope" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{options.data?.programs.map(p => <SelectItem key={p.id} value={p.id}>{scopeLabel(p)}{p.closed ? " · Closed" : ""}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <Tabs defaultValue="coupons" className="gap-6">
      <TabsList variant="line" className="w-full justify-start border-b"><TabsTrigger value="coupons" className="flex-none px-4">Coupons</TabsTrigger><TabsTrigger value="types" className="flex-none px-4">Coupon types</TabsTrigger></TabsList>
      <TabsContent value="types"><CouponTypeCatalog types={types} scope={scope} defaultId={effectiveDefault?.id} manager={codes.data?.manager ?? false} disabled={busy || scope.closed} onCreate={() => { setError(""); setCreatingType(true); }} onEdit={setEditingType} onRemove={type => { setError(""); setRemovingType(type); }} /></TabsContent>
      <TabsContent value="coupons" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-heading text-lg font-semibold">Generated coupons</h2><Button disabled={busy || scope.closed || !types.length} onClick={() => { setError(""); setGenerationTypeId(selectedType?.id ?? effectiveDefault?.id ?? ""); setGenerating(true); }}><HugeiconsIcon icon={Add01Icon} strokeWidth={1.5} />Generate coupons</Button></div>
      {generated.length > 0 && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => copy(generated)}><HugeiconsIcon icon={Copy01Icon} strokeWidth={1.5} />Copy generated coupons</Button><Button variant="outline" onClick={exportGenerated}><HugeiconsIcon icon={Download01Icon} strokeWidth={1.5} />Export generated coupons</Button></div>}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-2"><Label htmlFor="coupon-search">Search coupons</Label><Input id="coupon-search" type="search" maxLength={100} value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></div>
        <div className="min-w-52 flex-1 space-y-2"><Label htmlFor="coupon-type">Coupon type</Label><Select value={selectedType?.id ?? "all"} onValueChange={value => { setTypeId(value === "all" ? "" : value); setPage(0); setGenerated([]); }}><SelectTrigger id="coupon-type" className="w-full"><SelectValue>{selectedType ? `${selectedType.name} · ${selectedType.prefix}${selectedType.levelId === null ? " · All grades" : ""}` : "All types"}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{couponTypeGroups(types, scope).map(group => <SelectGroup key={group.label}><SelectLabel>{group.label}</SelectLabel>{group.types.map(type => <SelectItem key={type.id} value={type.id}>{type.name} · {type.prefix}{type.id === effectiveDefault?.id ? " · Default" : ""}</SelectItem>)}</SelectGroup>)}</SelectContent></Select></div>
        <div className="w-40 space-y-2"><Label htmlFor="coupon-status">Status</Label><Select value={status} onValueChange={value => { setStatus(value); setPage(0); }}><SelectTrigger id="coupon-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{["all", "unused", "redeemed", "revoked"].map(s => <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {codes.isLoading ? <Skeleton className="h-40 w-full" /> : !codes.data?.codes.length ? <Empty className="border"><EmptyHeader><EmptyTitle>{search || status !== "all" ? "No matching coupons" : "No coupons"}</EmptyTitle></EmptyHeader></Empty> : <div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead>Coupon</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Redeemed by</TableHead><TableHead>Unit</TableHead><TableHead>Redeemed at</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{codes.data.codes.map(c => <TableRow key={c.id}><TableCell className="font-mono">{formatCoupon(c.code, c.prefix)}</TableCell><TableCell>{c.type_name}</TableCell><TableCell><Badge variant="secondary">{c.status[0].toUpperCase() + c.status.slice(1)}</Badge></TableCell><TableCell>{c.student_name ?? "—"}</TableCell><TableCell>{c.unit_title ?? "—"}</TableCell><TableCell>{learningDate(c.redeemed_at)}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon-sm" aria-label={`Copy coupon ${formatCoupon(c.code, c.prefix)}`} onClick={() => copy([formatCoupon(c.code, c.prefix)])}><HugeiconsIcon icon={Copy01Icon} strokeWidth={1.5} /></Button>{codes.data?.manager && c.status === "unused" && <Button variant="ghost" size="icon-sm" aria-label={`Revoke coupon ${formatCoupon(c.code, c.prefix)}`} disabled={busy || scope.closed} onClick={() => setRevoking(c.id)}><HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} /></Button>}</div></TableCell></TableRow>)}</TableBody></Table></div>}
      {(page > 0 || codes.data?.hasMore) && <div className="flex justify-end gap-2"><Button variant="outline" disabled={page === 0 || codes.isFetching} onClick={() => setPage(p => p - 1)}>Previous</Button><Button variant="outline" disabled={!codes.data?.hasMore || codes.isFetching} onClick={() => setPage(p => p + 1)}>Next</Button></div>}
      </TabsContent></Tabs>
      <Dialog open={creatingType} onOpenChange={open => { if (!busy) setCreatingType(open); }}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>New coupon type</DialogTitle></DialogHeader>
        <form className="space-y-5" onSubmit={e => { e.preventDefault(); void mutate("type"); }}>
          <div className="text-sm font-medium">{scopeLabel(scope)}</div>
          <div className="space-y-2"><Label htmlFor="coupon-type-name">Name</Label><Input id="coupon-type-name" maxLength={80} value={typeName} disabled={busy} onChange={e => { setTypeName(e.target.value); if (!prefixEdited) setTypePrefix(e.target.value.replace(/[^a-zA-Z]/g, "").slice(0,3).toUpperCase()); }} /></div>
          <div className="space-y-2"><Label htmlFor="new-type-prefix">Type prefix</Label><Input id="new-type-prefix" maxLength={4} value={typePrefix} disabled={busy} onChange={e => { setPrefixEdited(true); setTypePrefix(e.target.value.toUpperCase()); }} /></div>
          <div className="rounded-lg bg-muted/50 p-3 font-mono text-sm">{scope.prefix ? `${scope.prefix}-` : ""}{typePrefix || "TYPE"}-XXXX-XXXX</div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setCreatingType(false)}>Cancel</Button><Button type="submit" disabled={busy || !typeName.trim() || !/^[A-Z]{2,4}$/.test(typePrefix)}>{busy ? "Creating…" : "Create type"}</Button></DialogFooter>
        </form>
      </DialogContent></Dialog>
      <Dialog open={generating} onOpenChange={open => { if (!busy) setGenerating(open); }}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>Generate coupons</DialogTitle></DialogHeader>
        <form className="space-y-5" onSubmit={e => { e.preventDefault(); void mutate("generate"); }}>
          <div className="text-sm font-medium">{scopeLabel(scope)}</div>
          <div className="space-y-2"><Label htmlFor="generate-type">Coupon type</Label><Select value={generationType?.id} disabled={busy} onValueChange={setGenerationTypeId}><SelectTrigger id="generate-type" className="w-full"><SelectValue>{generationType ? `${generationType.name} · ${generationType.prefix}${generationType.levelId === null ? " · All grades" : ""}` : undefined}</SelectValue></SelectTrigger><SelectContent>{couponTypeGroups(types, scope).map(group => <SelectGroup key={group.label}><SelectLabel>{group.label}</SelectLabel>{group.types.map(type => <SelectItem key={type.id} value={type.id}>{type.name} · {type.prefix}</SelectItem>)}</SelectGroup>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="coupon-quantity">Number of coupons</Label><Input id="coupon-quantity" type="number" min={1} max={1000} value={quantity} disabled={busy} onChange={e => setQuantity(e.target.value)} /></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setGenerating(false)}>Cancel</Button><Button type="submit" disabled={busy || !generationType}>{busy ? "Generating…" : "Generate coupons"}</Button></DialogFooter>
        </form>
      </DialogContent></Dialog>
      {editingType && <CouponTypeEditor key={editingType.id} academyId={academy.id} scope={scope} type={editingType} onClose={() => setEditingType(null)} onSaved={async () => { await refresh(); setNotice("Coupon type updated."); }} />}
    </>}
    {((error && !creatingType && !generating && !removingType) || queryError) && <p role="alert" className="text-sm text-destructive">{error || queryError?.message}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    <AlertDialog open={Boolean(removingType)} onOpenChange={open => { if (!open && !busy) setRemovingType(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove {removingType?.name}?</AlertDialogTitle><AlertDialogDescription>Used types will be archived. Existing codes and access will remain valid. Unused custom types will be permanently deleted.</AlertDialogDescription></AlertDialogHeader>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void removeType(); }}>Remove type</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={Boolean(revoking)} onOpenChange={open => { if (!open && !busy) setRevoking(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Revoke this coupon?</AlertDialogTitle><AlertDialogDescription>It will no longer grant unit access.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void mutate("revoke"); }}>Revoke coupon</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}
