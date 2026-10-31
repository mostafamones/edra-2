"use client";
import type { ReactNode } from "react";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { UnitRequirements } from "../requirements/editor";
import type { ContentDocument } from "../types";
import { AccessDuration } from "./duration";

/** A unit's settings, the same in the editor's panel and the library's sheet. `children` is the closing action. */
export function UnitSettings({ academyId, unitId, userId, document, disabled, onChange, children }: {
  academyId: string; unitId: string; userId: string; document: ContentDocument; disabled: boolean; onChange: (document: ContentDocument) => void; children?: ReactNode;
}) {
  return <>
    <FieldGroup className="gap-4">
      <Field><FieldLabel htmlFor="content-title">Title</FieldLabel><Input id="content-title" dir="auto" maxLength={200} value={document.title} disabled={disabled} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} onChange={e => onChange({ ...document, title: e.target.value })} /></Field>
      <Field><FieldLabel htmlFor="content-description">Description</FieldLabel><Textarea id="content-description" dir="auto" className="min-h-28" maxLength={10000} value={document.description} disabled={disabled} onChange={e => onChange({ ...document, description: e.target.value })} /></Field>
    </FieldGroup>
    <Separator className="bg-border/70" />
    <section aria-labelledby="unit-access" className="flex flex-col gap-4">
      <h3 id="unit-access" className="text-sm font-medium text-muted-foreground">Access</h3>
      <AccessDuration value={document.accessDays} disabled={disabled} onChange={accessDays => onChange({ ...document, accessDays })} />
      <UnitRequirements academyId={academyId} unitId={unitId} userId={userId} document={document} onChange={onChange} disabled={disabled} />
    </section>
    {children}
  </>;
}
