"use client";

import { useQuery } from "@tanstack/react-query";
import { SettingsGroup } from "@/components/shared/settings-group";
import { SettingsRow } from "@/components/shared/settings-row";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { loadRequirementOptions } from "./actions";
import { unwrapContent, type ContentDocument } from "../types";

type Requirement = NonNullable<ContentDocument["prerequisites"]>[number];

export function UnitRequirements({ academyId, unitId, userId, document, onChange, disabled }: {
  academyId: string; unitId: string; userId: string; document: ContentDocument; onChange: (document: ContentDocument) => void; disabled: boolean;
}) {
  const query = useQuery({ queryKey: ["content-requirements", userId, academyId, unitId], queryFn: async () => {
    const result = unwrapContent(await loadRequirementOptions({ academyId, unitId }));
    if (result.userId !== userId) throw new Error("Your account changed. Reload this page.");
    return result;
  } });
  const selected = document.prerequisites ?? [];
  const unavailable = selected.filter(requirement => !query.data?.units.some(unit => unit.id === requirement.unitId && unit.assessments?.some(assessment => assessment.kind === requirement.kind && assessment.id === requirement.assessmentId)));
  const row = (id: string, title: string, checked: boolean, toggle: (value: boolean) => void) => <SettingsRow key={id} id={id} title={title}><Checkbox id={id} disabled={disabled} checked={checked} onCheckedChange={value => toggle(value === true)} /></SettingsRow>;
  return <SettingsGroup title="Requirements">
    {query.isLoading ? <div className="px-6 py-5"><Skeleton className="h-20 w-full" /></div> : query.isError ? <p role="alert" className="px-6 py-5 text-sm text-destructive">{query.error.message}</p> : <>
      <SettingsRow id="unit-coupon-type" title="Coupon type"><Select disabled={disabled} value={document.couponTypeId ?? "none"} onValueChange={value => onChange({ ...document, couponTypeId: value === "none" ? null : value })}><SelectTrigger id="unit-coupon-type" size="sm" className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No coupon type</SelectItem>{query.data?.types.map(type => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent></Select></SettingsRow>
      {query.data?.units.filter(unit => unit.assessments?.length).map(unit => <div key={unit.id} role="group" aria-labelledby={`prerequisite-unit-${unit.id}`} className="divide-y divide-border/60">
        <h3 id={`prerequisite-unit-${unit.id}`} dir="auto" className="bg-muted/30 px-6 py-2 text-xs font-medium text-muted-foreground">{unit.title}</h3>
        {unit.assessments?.map(assessment => {
          const matches = (r: Requirement) => r.unitId === unit.id && r.kind === assessment.kind && r.assessmentId === assessment.id;
          return row(`prerequisite-${unit.id}-${assessment.kind}-${assessment.id}`, assessment.title, selected.some(matches),
            value => onChange({ ...document, prerequisites: value ? [...selected, { unitId: unit.id, kind: assessment.kind, assessmentId: assessment.id }] : selected.filter(r => !matches(r)) }));
        })}
      </div>)}
      {unavailable.map(requirement => row(`unavailable-${requirement.unitId}-${requirement.kind}-${requirement.assessmentId}`, `Unavailable prerequisite · ${requirement.kind}`, true,
        () => onChange({ ...document, prerequisites: selected.filter(item => item !== requirement) })))}
      {!selected.length && !query.data?.units.some(unit => unit.assessments?.length) && <p className="px-6 py-5 text-sm text-muted-foreground">No prerequisite assessments</p>}
    </>}
  </SettingsGroup>;
}
