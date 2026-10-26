"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowDown01Icon, Cancel01Icon, SquareUnlock01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ContentDocument } from "../types";

type Requirement = NonNullable<ContentDocument["prerequisites"]>[number];
type Unit = { id: string; title: string; assessments: { id: string; kind: "assignment" | "quiz"; title: string }[] | null };
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").toLowerCase();

export function PrerequisitePicker({ units, selected, onChange, disabled }: { units: Unit[]; selected: Requirement[]; onChange: (requirements: Requirement[]) => void; disabled: boolean }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const ids = [...new Set(selected.map(requirement => requirement.unitId))];
  const query = normalize(search.trim());
  const visible = units.filter(unit => normalize(`${unit.title} ${unit.assessments?.map(a => a.title).join(" ") ?? ""}`).includes(query));
  function toggleUnit(unitId: string, checked: boolean) {
    onChange(checked ? [...selected, { unitId, kind: "access" }] : selected.filter(r => r.unitId !== unitId));
  }
  function toggleAssessment(unitId: string, assessment: NonNullable<Unit["assessments"]>[number], checked: boolean) {
    if (!checked) { onChange(selected.filter(r => !(r.unitId === unitId && r.kind === assessment.kind && r.assessmentId === assessment.id))); return; }
    const access = selected.some(r => r.unitId === unitId && r.kind === "access") ? [] : [{ unitId, kind: "access" as const }];
    onChange([...selected, ...access, { unitId, kind: assessment.kind, assessmentId: assessment.id }]);
  }
  return <section aria-label="Prerequisites" className="space-y-3">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium text-muted-foreground">Prerequisites</h3>
      <Dialog onOpenChange={open => { if (!open) { setSearch(""); setExpanded(null); } }}>
        <DialogTrigger asChild><Button variant="ghost" size="sm" className="text-muted-foreground" aria-label="Add prerequisite" disabled={disabled}><HugeiconsIcon icon={Add01Icon} strokeWidth={1.5} aria-hidden="true" />Add</Button></DialogTrigger>
        <DialogContent className="sm:max-w-xl" aria-describedby={undefined}><DialogHeader><DialogTitle>Prerequisites</DialogTitle></DialogHeader>
          <Input aria-label="Search prerequisite units or assessments" type="search" value={search} onChange={event => setSearch(event.target.value)} />
          <div className="max-h-[60svh] space-y-2 overflow-y-auto">
            {visible.map(unit => {
              const chosen = selected.filter(r => r.unitId === unit.id);
              const assessments = chosen.filter(r => r.kind !== "access");
              const choices = unit.assessments?.filter(assessment => !query || normalize(unit.title).includes(query) || normalize(assessment.title).includes(query));
              return <Collapsible key={unit.id} open={expanded === unit.id || Boolean(query && unit.assessments?.some(a => normalize(a.title).includes(query)))} onOpenChange={open => setExpanded(open ? unit.id : null)} className="rounded-lg border">
                <CollapsibleTrigger asChild><Button variant="ghost" className="h-auto w-full justify-between whitespace-normal p-3 text-start"><span>{unit.title}</span><span className="flex shrink-0 items-center gap-2">{chosen.length > 0 && <Badge variant="secondary">{assessments.length ? `${assessments.length + 1} requirements` : "Unlock required"}</Badge>}<HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.5} className="size-4" /></span></Button></CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 border-t p-3">
                  <div className="flex items-center gap-2"><Checkbox id={`unlock-${unit.id}`} checked={chosen.length > 0} disabled={disabled} onCheckedChange={value => toggleUnit(unit.id, value === true)} /><Label htmlFor={`unlock-${unit.id}`}>Previously unlocked</Label></div>
                  {choices?.map(assessment => {
                    const id = `required-${unit.id}-${assessment.kind}-${assessment.id}`;
                    return <div key={id} className="ms-4 flex items-center gap-2"><Checkbox id={id} checked={assessments.some(r => r.kind === assessment.kind && r.assessmentId === assessment.id)} disabled={disabled} onCheckedChange={value => toggleAssessment(unit.id, assessment, value === true)} /><Label htmlFor={id}>{assessment.title}</Label></div>;
                  })}
                </CollapsibleContent>
              </Collapsible>;
            })}
            {!visible.length && <p className="py-8 text-center text-sm text-muted-foreground">{query ? "No matching prerequisites" : "No published units"}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
    {ids.map(id => {
      const unit = units.find(u => u.id === id);
      const assessments = selected.filter(r => r.unitId === id && r.kind !== "access");
      return <div key={id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0 space-y-1"><p className="truncate text-sm font-medium">{unit?.title ?? "Unavailable prerequisite unit"}</p><div className="flex flex-wrap gap-1"><Badge variant="secondary">Previously unlocked</Badge>{assessments.map(r => <Badge key={`${r.kind}:${r.assessmentId}`} variant="outline">{unit?.assessments?.find(a => a.id === r.assessmentId && a.kind === r.kind)?.title ?? `Unavailable ${r.kind}`}</Badge>)}</div></div><Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={`Remove ${unit?.title ?? "unavailable prerequisite"}`} onClick={() => onChange(selected.filter(r => r.unitId !== id))}><HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} /></Button></div>;
    })}
    {!ids.length && <Empty className="gap-2 rounded-lg bg-muted/30 p-6"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={SquareUnlock01Icon} strokeWidth={1.5} aria-hidden="true" /></EmptyMedia><EmptyTitle className="text-sm font-normal text-muted-foreground">No prerequisites</EmptyTitle></EmptyHeader></Empty>}
  </section>;
}
