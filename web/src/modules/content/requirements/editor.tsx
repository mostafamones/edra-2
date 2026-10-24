"use client";

import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  return <section className="space-y-4 rounded-xl border bg-card p-4">
    <h2 className="text-base font-semibold">Access requirements</h2>
    {query.isLoading ? <Skeleton className="h-20 w-full" /> : query.isError ? <p role="alert" className="text-sm text-destructive">{query.error.message}</p> : <>
      <div className="space-y-2"><Label htmlFor="unit-coupon-type">Coupon type</Label><Select disabled={disabled} value={document.couponTypeId ?? "none"} onValueChange={value => onChange({ ...document, couponTypeId: value === "none" ? null : value })}><SelectTrigger id="unit-coupon-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No coupon type</SelectItem>{query.data?.types.map(type => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-3"><h3 className="text-sm font-medium">Required submissions</h3>{query.data?.units.filter(unit => unit.assessments?.length).map(unit => <fieldset key={unit.id} className="space-y-2 rounded-lg border p-3"><legend className="px-1 text-sm font-medium">{unit.title}</legend>{unit.assessments?.map(assessment => {
        const checked = selected.some(r => r.unitId === unit.id && r.kind === assessment.kind && r.assessmentId === assessment.id);
        const id = `prerequisite-${unit.id}-${assessment.kind}-${assessment.id}`;
        return <div key={id} className="flex items-center gap-2"><Checkbox id={id} disabled={disabled} checked={checked} onCheckedChange={value => onChange({ ...document, prerequisites: value === true ? [...selected, { unitId: unit.id, kind: assessment.kind, assessmentId: assessment.id }] : selected.filter(r => !(r.unitId === unit.id && r.kind === assessment.kind && r.assessmentId === assessment.id)) })} /><Label htmlFor={id}>{assessment.title}</Label></div>;
      })}</fieldset>)}{!query.data?.units.some(unit => unit.assessments?.length) && <p className="text-sm text-muted-foreground">No prerequisite assessments</p>}</div>
    </>}
  </section>;
}
