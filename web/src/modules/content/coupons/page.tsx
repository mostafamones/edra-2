"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, TicketStarIcon, ViewIcon } from "@hugeicons/core-free-icons";
import { AcademyGate, useAuth } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { HeaderActions } from "@/components/shared/header-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { unwrapContent } from "../types";
import { learningDate } from "../access/types";
import { loadCouponBatches, loadCouponOptions } from "./actions";
import { withAcademyScopes, type CouponBatch } from "./types";
import { CouponTypeList } from "./type-list";
import { GenerateDialog } from "./generate";
import { CouponBatchSheet } from "./batch";

export function CouponsPage() {
  const { user } = useAuth();
  return <AcademyGate>{academy => <CouponWorkspace key={`${academy.id}:${user?.id}`} academy={academy} />}</AcademyGate>;
}

function CouponWorkspace({ academy }: { academy: AcademyEntry }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [prefixTab, setPrefixTab] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [opened, setOpened] = useState<CouponBatch | null>(null);
  const rootKey = ["content-coupons", user?.id, academy.id];
  const options = useQuery({ queryKey: [...rootKey, "options"], enabled: Boolean(user), queryFn: async () => {
    const result = unwrapContent(await loadCouponOptions({ academyId: academy.id }));
    if (result.userId !== user?.id) throw new Error("Your account changed. Reload this page.");
    return result;
  } });
  // Coupons are only issued for the active academic year; the whole academy comes first and is the default.
  const programs = withAcademyScopes(options.data?.programs.filter(p => !p.closed) ?? []);
  const allTypes = options.data?.types ?? [];
  // Type tabs group by the first three letters of each prefix.
  const tabs = [...new Set(allTypes.filter(t => t.levelId === null && t.yearId === programs[0]?.yearId).map(t => t.prefix.slice(0, 3)))].sort();
  const prefix = tabs.includes(prefixTab) ? prefixTab : null;
  const batches = useQuery({ queryKey: [...rootKey, "batches", programs[0]?.yearId, prefix, search, page], enabled: Boolean(user && options.isSuccess), queryFn: async () => {
    const result = unwrapContent(await loadCouponBatches({ academyId: academy.id, yearId: programs[0]?.yearId ?? null, levelId: null, trackId: null, academyWide: true, prefix, search, page }));
    if (result.userId !== user?.id) throw new Error("Your account changed. Reload this page.");
    return result;
  } });
  async function refresh() { await cache.invalidateQueries({ queryKey: rootKey }); }
  const queryError = options.error ?? batches.error;
  const filtered = Boolean(search) || Boolean(prefix);
  return <main className="page-shell min-w-0">
    <HeaderActions>
      <GenerateDialog academyId={academy.id} programs={programs} allTypes={allTypes} onGenerated={async batch => { setSearch(""); setPage(0); setOpened(batch); await refresh(); }} />
    </HeaderActions>
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <h1 className="text-2xl font-bold tracking-tight">Coupons</h1>
      {queryError && <Alert variant="destructive" role="alert"><AlertDescription className="flex items-center gap-3">{queryError.message}<Button variant="outline" size="sm" disabled={options.isFetching || batches.isFetching} onClick={() => void refresh()}>Retry</Button></AlertDescription></Alert>}
      {options.isLoading ? <Skeleton className="h-48 w-full rounded-lg" /> : options.isError ? null : <>
        {programs.length > 0 && <CouponTypeList academyId={academy.id} programs={programs} allTypes={allTypes} manager={Boolean(batches.data?.manager)} onChanged={refresh} />}

        <section aria-label="Coupon batches" className="flex flex-col gap-4">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
            <Tabs value={prefix ?? "all"} onValueChange={value => { setPrefixTab(value); setPage(0); }} className="min-w-0 flex-1">
              <TabsList variant="line" aria-label="Coupon type" className="w-full justify-start overflow-x-auto border-b">
                <TabsTrigger value="all" className="flex-none">All</TabsTrigger>
                {tabs.map(t => <TabsTrigger key={t} value={t} className="flex-none">{t}</TabsTrigger>)}
              </TabsList>
            </Tabs>
            <div className="flex gap-2">
              <InputGroup className="sm:w-60">
                <InputGroupInput type="search" placeholder="Search coupons" aria-label="Search coupons" maxLength={100} value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
                <InputGroupAddon><HugeiconsIcon icon={Search01Icon} strokeWidth={1.5} aria-hidden="true" /></InputGroupAddon>
              </InputGroup>
            </div>
          </div>
          {batches.isLoading ? <Skeleton className="h-48 w-full rounded-lg" /> : !batches.data?.batches.length
            ? <EmptyState title={filtered ? "No matching coupons" : "No coupons"}>{filtered && <Button variant="outline" size="sm" onClick={() => { setSearch(""); setPrefixTab("all"); setPage(0); }}>Clear filters</Button>}</EmptyState>
            : <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Type</TableHead><TableHead className="text-center">Coupons</TableHead><TableHead className="text-center">Redeemed</TableHead><TableHead className="text-center">Created</TableHead><TableHead className="text-center"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
                <TableBody>{batches.data.batches.map(b => <TableRow key={b.id}>
                  <TableCell dir="auto">{b.type_name} <span className="font-mono text-xs text-muted-foreground">{b.prefix}</span></TableCell>
                  <TableCell className="text-center tabular-nums">{b.quantity}</TableCell>
                  <TableCell className="text-center tabular-nums">{b.redeemed}</TableCell>
                  <TableCell className="text-center text-muted-foreground tabular-nums">{learningDate(b.created_at)}</TableCell>
                  <TableCell className="text-center"><Button variant="ghost" size="sm" onClick={() => setOpened(b)}><HugeiconsIcon icon={ViewIcon} strokeWidth={1.5} aria-hidden="true" />Details</Button></TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </div>}
          {(page > 0 || batches.data?.hasMore) && <div className="flex justify-end gap-2"><Button variant="outline" size="sm" disabled={page === 0 || batches.isFetching} onClick={() => setPage(p => p - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={!batches.data?.hasMore || batches.isFetching} onClick={() => setPage(p => p + 1)}>Next</Button></div>}
        </section>
      </>}
    </div>
    <CouponBatchSheet academyId={academy.id} userId={user?.id} batch={opened} onClose={() => setOpened(null)} onChanged={refresh} />
  </main>;
}

function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return <Empty className="min-h-56 rounded-lg border border-dashed bg-card/20">
    <EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={TicketStarIcon} strokeWidth={1.5} aria-hidden="true" /></EmptyMedia><EmptyTitle>{title}</EmptyTitle></EmptyHeader>
    {children && <EmptyContent>{children}</EmptyContent>}
  </Empty>;
}
