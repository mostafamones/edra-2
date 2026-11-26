import { useState } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { questionEdit, type BankDetail, type QuestionEdit } from "./bank-contract";

const none = "none";

/** Prompt, choice texts, confirmed answer and model answer. The parent renders the submit button for `formId`. */
export function QuestionEditor({ detail, formId, error, pending, onSubmit }: {
  detail: BankDetail; formId: string; error?: string; pending: boolean; onSubmit: (changes: QuestionEdit) => void;
}) {
  const { payload } = detail;
  const [draft, setDraft] = useState<QuestionEdit>(() => ({
    prompt: payload.prompt, choices: payload.choices, answer: payload.answer, modelAnswer: payload.modelAnswer ?? "",
  }));
  const [invalid, setInvalid] = useState(false);
  const setChoice = (key: string, text: string) => setDraft(previous => ({ ...previous, choices: previous.choices.map(choice => choice.key === key ? { ...choice, text } : choice) }));
  const emptyPrompt = invalid && !draft.prompt.trim();
  return <form id={formId} className="space-y-6" noValidate onSubmit={event => {
    event.preventDefault();
    const parsed = questionEdit.safeParse(draft);
    if (!parsed.success) { setInvalid(true); return; }
    onSubmit(parsed.data);
  }}>
    <fieldset disabled={pending} className="space-y-6">
      <FieldGroup>
        <Field data-invalid={emptyPrompt || undefined}>
          <FieldLabel htmlFor="qb-edit-prompt">Prompt</FieldLabel>
          <Textarea id="qb-edit-prompt" dir="auto" rows={4} maxLength={10_000} value={draft.prompt} aria-invalid={emptyPrompt || undefined}
            onChange={event => setDraft({ ...draft, prompt: event.target.value })} />
          {emptyPrompt && <FieldError>Enter the prompt.</FieldError>}
        </Field>
      </FieldGroup>
      {draft.choices.length > 0 ? <FieldSet>
        <FieldLegend variant="label">Choices</FieldLegend>
        <RadioGroup value={draft.answer ?? none} onValueChange={value => setDraft({ ...draft, answer: value === none ? null : value })} className="gap-2" aria-label="Confirmed answer">
          {draft.choices.map(choice => {
            const empty = invalid && !choice.text.trim();
            return <div key={choice.key} className="flex items-center gap-3">
              <RadioGroupItem value={choice.key} id={`qb-edit-answer-${choice.key}`} aria-label={`Mark ${choice.key} as the answer`} />
              <span className="w-4 text-sm font-medium">{choice.key}</span>
              <Input dir="auto" maxLength={2000} value={choice.text} aria-label={`Choice ${choice.key}`} aria-invalid={empty || undefined}
                onChange={event => setChoice(choice.key, event.target.value)} />
            </div>;
          })}
          <label className="flex items-center gap-3 text-sm text-muted-foreground">
            <RadioGroupItem value={none} />No confirmed answer
          </label>
        </RadioGroup>
        {invalid && draft.choices.some(choice => !choice.text.trim()) && <FieldError>Every choice needs text.</FieldError>}
      </FieldSet> : <Field>
        <FieldLabel htmlFor="qb-edit-model">Model answer</FieldLabel>
        <Textarea id="qb-edit-model" dir="auto" rows={4} maxLength={10_000} value={draft.modelAnswer}
          onChange={event => setDraft({ ...draft, modelAnswer: event.target.value })} />
      </Field>}
      {error && <Alert variant="destructive"><AlertTitle>{error}</AlertTitle></Alert>}
    </fieldset>
  </form>;
}
