"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { suggestCoupon, isRevision } from "./coupon-suggestion";
import { Label } from "@/components/ui/label";
import { PrerequisitePicker } from "./picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { loadRequirementOptions } from "./actions";
import { unwrapContent, type ContentDocument } from "../types";

export function UnitRequirements({ academyId, unitId, userId, document, onChange, disabled }: {
  academyId: string; unitId: string; userId: string; document: ContentDocument; onChange: (document: ContentDocument) => void; disabled: boolean;
}) {
  const query = useQuery({ queryKey: ["content-requirements", userId, academyId, unitId], queryFn: async () => {
    const result = unwrapContent(await loadRequirementOptions({ academyId, unitId }));
    if (result.userId !== userId) throw new Error("Your account changed. Reload this page.");
    return result;
  } });
  const selected = document.prerequisites ?? [];
  const [settledTitle, setSettledTitle] = useState(document.title);
  const [dismissed, setDismissed] = useState("");
  useEffect(() => { const timer = setTimeout(() => setSettledTitle(document.title), 600); return () => clearTimeout(timer); }, [document.title]);
  const suggestion = suggestCoupon(settledTitle, document.couponTypeId, query.data?.types ?? []);
  const suggestionKey = `${isRevision(settledTitle)}:${document.couponTypeId}:${suggestion?.id}`;
  return <section aria-label="Access requirements" className="space-y-4">
    {!disabled && suggestion && dismissed !== suggestionKey && <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-3"><span className="flex-1 text-sm">Use {suggestion.name} for this title?</span><Button size="sm" variant="outline" onClick={() => onChange({ ...document, couponTypeId: suggestion.id })}>Use {suggestion.name}</Button><Button size="sm" variant="ghost" onClick={() => setDismissed(suggestionKey)}>Keep current</Button></div>}
    {query.isLoading ? <Skeleton className="h-20 w-full" /> : query.isError ? <p role="alert" className="text-sm text-destructive">{query.error.message}</p> : <>
      <div className="space-y-2"><Label htmlFor="unit-coupon-type">Coupon type</Label><Select disabled={disabled} value={document.couponTypeId ?? "none"} onValueChange={value => onChange({ ...document, couponTypeId: value === "none" ? null : value })}><SelectTrigger id="unit-coupon-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No coupon type</SelectItem>{query.data?.types.map(type => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent></Select></div>
      <PrerequisitePicker units={query.data?.units ?? []} selected={selected} disabled={disabled} onChange={prerequisites => onChange({ ...document, prerequisites })} />
    </>}
  </section>;
}
