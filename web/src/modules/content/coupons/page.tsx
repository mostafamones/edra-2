"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { AcademyGate, useAuth } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { HeaderActions } from "@/components/shared/header-actions";
import { QueryContent } from "@/components/shared/query-content";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { withAcademyScopes, type CouponBatch } from "./types";
import { CouponTypeList } from "./type-list";
import { GenerateDialog } from "./generate";
import { CouponBatchSheet } from "./batch";
import { CouponBatches } from "./batches";
import { couponRootKey, couponOptions, couponBatchesOptions } from "./queries";

export function CouponsPage() {
  const { user } = useAuth();
  return <AcademyGate>{academy => <CouponWorkspace key={`${academy.id}:${user?.id}`} academy={academy} />}</AcademyGate>;
}

function CouponWorkspace({ academy }: { academy: AcademyEntry }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [prefixTab, setPrefixTab] = useState("all");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState({ search: "", page: 0 });
  const { page } = applied;
  const typing = search.trim() !== applied.search;
  useEffect(() => {
    const timer = setTimeout(() => setApplied(current => current.search === search.trim() ? current : { search: search.trim(), page: 0 }), 250);
    return () => clearTimeout(timer);
  }, [search]);
  function clearFilters() { setSearch(""); setPrefixTab("all"); setApplied({ search: "", page: 0 }); }
  const [opened, setOpened] = useState<CouponBatch | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  function openBatch(batch: CouponBatch) { returnFocus.current = document.activeElement as HTMLElement | null; setOpened(batch); }
  const rootKey = couponRootKey(user?.id ?? "", academy.id);
  const options = useQuery(couponOptions(user?.id ?? "", academy.id));
  // Coupons are only issued for the active academic year; the whole academy comes first and is the default.
  const programs = withAcademyScopes(options.data?.programs.filter(p => !p.closed) ?? []);
  const allTypes = options.data?.types ?? [];
  // Type tabs group by the first three letters of each prefix.
  const tabs = [...new Set(allTypes.filter(t => t.levelId === null && t.yearId === programs[0]?.yearId).map(t => t.prefix.slice(0, 3)))].sort();
  const prefix = tabs.includes(prefixTab) ? prefixTab : null;
  const batches = useQuery({ ...couponBatchesOptions(user?.id ?? "", academy.id, programs[0]?.yearId ?? null, prefix, applied.search, page), enabled: Boolean(user && options.data && !typing) });
  async function refresh() { await cache.invalidateQueries({ queryKey: rootKey }); }
  const filtered = Boolean(search) || Boolean(prefix);
  return <main className="page-shell min-w-0">
    <HeaderActions>
      <GenerateDialog academyId={academy.id} programs={programs} allTypes={allTypes} onGenerated={async batch => { setSearch(""); setApplied({ search: "", page: 0 }); setOpened(batch); await refresh(); }} />
    </HeaderActions>
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <h1 className="text-2xl font-bold tracking-tight">Coupons</h1>
      <QueryContent query={options} label="coupon settings" isEmpty={() => false} emptyTitle="No coupon settings">{() => <>
        {programs.length > 0 && <CouponTypeList academyId={academy.id} programs={programs} allTypes={allTypes} manager={Boolean(batches.data?.manager)} onChanged={refresh} />}

        <section aria-label="Coupon batches" className="flex flex-col gap-4">
          <Tabs value={prefix ?? "all"} onValueChange={value => { setPrefixTab(value); setApplied(current => ({ ...current, page: 0 })); }} className="min-w-0 gap-4">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
              <TabsList variant="line" aria-label="Coupon type" className="min-w-0 flex-1 justify-start overflow-x-auto border-b">
                <TabsTrigger value="all" className="flex-none">All</TabsTrigger>
                {tabs.map(t => <TabsTrigger key={t} value={t} className="flex-none">{t}</TabsTrigger>)}
              </TabsList>
            <div className="flex gap-2">
              <InputGroup className="sm:w-60">
                <InputGroupInput type="search" placeholder="Search coupons" aria-label="Search coupons" maxLength={100} value={search} onChange={e => setSearch(e.target.value)} />
                <InputGroupAddon><HugeiconsIcon icon={Search01Icon} strokeWidth={1.5} aria-hidden="true" /></InputGroupAddon>
              </InputGroup>
            </div>
          </div>
          <TabsContent value={prefix ?? "all"} className="flex flex-col gap-4">
          {typing ? <div role="status" className="py-12 text-center text-sm text-muted-foreground">Searching…</div> :
            <QueryContent query={batches} label="coupon batches" isEmpty={data => data.batches.length === 0} emptyTitle={filtered ? "No matching coupons" : "No coupons"}
              emptyAction={filtered && <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>}>
              {data => <CouponBatches batches={data.batches} onOpen={openBatch} />}
            </QueryContent>}
          {(page > 0 || batches.data?.hasMore) && <div className="flex items-center justify-end gap-2"><span className="mr-auto text-sm text-muted-foreground">Page {page + 1}</span><Button variant="outline" size="sm" disabled={page === 0 || batches.isFetching || typing} onClick={() => setApplied(current => ({ ...current, page: current.page - 1 }))}>Previous</Button><Button variant="outline" size="sm" disabled={!batches.data?.hasMore || batches.isFetching || typing} onClick={() => setApplied(current => ({ ...current, page: current.page + 1 }))}>Next</Button></div>}
          </TabsContent>
          </Tabs>
        </section>
      </>}</QueryContent>
    </div>
    <CouponBatchSheet academyId={academy.id} userId={user?.id} batch={opened} onClose={() => setOpened(null)} onChanged={refresh}
      onCloseAutoFocus={event => { if (returnFocus.current?.isConnected) { event.preventDefault(); returnFocus.current.focus(); } }} />
  </main>;
}
