"use client";
import { newUuid } from "@/lib/uuid";
import { useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ContentItem } from "../types";
import { MaterialUploader } from "./uploader";
import { AssessmentPicker } from "./assessment-picker";

type Kind = "explanation" | "document" | "answer" | "assessment";
const TABS: { value: Kind; label: string }[] = [
  { value: "explanation", label: "Video" },
  { value: "document", label: "Document" },
  { value: "assessment", label: "Assessment" },
  { value: "answer", label: "Answer video" },
];

/** The panel for adding uploads and assessments to the unit's material. */
export function AddMaterial({ academyId, unitId, version, items, dirty, disabled, busy, onBusy, onUploaded, onAdd, onCreated }: {
  academyId: string; unitId: string; version: number; items: ContentItem[]; dirty: boolean; disabled: boolean; busy: boolean;
  onBusy: (busy: boolean) => void; onUploaded: (item: ContentItem) => void; onAdd: (item: ContentItem) => void; onCreated: () => Promise<void>;
}) {
  const [kind, setKind] = useState<Kind>("explanation");
  const [answerFor, setAnswerFor] = useState("");
  const assessments = items.filter(i => i.kind === "assessment");
  const answer = assessments.find(i => i.id === answerFor);
  function uploaded(assetId: string, title: string) {
    if (kind === "assessment") return;
    onUploaded({ id: newUuid(), kind, title, assetId, ...(kind === "answer" && answer ? { assessmentKind: answer.assessmentKind, assessmentId: answer.assessmentId } : {}) });
  }
  return <section aria-label="Add material" className="rounded-xl border bg-card">
    <Tabs value={kind} onValueChange={value => { if (!busy) setKind(value as Kind); }} className="gap-0">
      <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b px-3">
        {TABS.map(t => <TabsTrigger key={t.value} value={t.value} disabled={busy && t.value !== kind} className="flex-none">{t.label}</TabsTrigger>)}
      </TabsList>
      <TabsContent value={kind} className="space-y-3 p-4">
        {kind === "assessment"
          ? <AssessmentPicker academyId={academyId} unitId={unitId} items={items} version={version} dirty={dirty} disabled={disabled} onAdd={onAdd} onCreated={onCreated} />
          : <>
            {kind === "answer" && <Field><FieldLabel htmlFor="answer-assessment">Assessment</FieldLabel><Select value={answerFor} onValueChange={setAnswerFor} disabled={busy || !assessments.length}><SelectTrigger id="answer-assessment" className="w-full"><SelectValue placeholder={assessments.length ? "Choose an attached assessment" : "Attach an assessment first"} /></SelectTrigger><SelectContent>{assessments.map(i => <SelectItem key={i.id} value={i.id}>{i.title}</SelectItem>)}</SelectContent></Select></Field>}
            <MaterialUploader key={kind} academyId={academyId} unitId={unitId} kind={kind === "document" ? "document" : "video"} disabled={disabled || (kind === "answer" && !answer)} onBusy={onBusy} onUploaded={uploaded} />
          </>}
      </TabsContent>
    </Tabs>
  </section>;
}
