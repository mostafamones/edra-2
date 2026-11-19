import { useState } from "react";
import { MathText } from "@/components/shared/math-text";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { hasMath, mathDirection, normalizeMathSource } from "@/lib/math";

export function QuestionTextField({ id, label, value, onChange, error, multiline = false, normalize = normalizeMathSource }: {
  id: string; label: string; value: string; onChange: (value: string) => void; error?: string;
  multiline?: boolean; normalize?: (value: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const math = hasMath(value);
  const source = editing || !math;
  const props = { id, value, dir: "auto", "aria-label": label, "aria-invalid": !!error,
    "aria-describedby": error ? `${id}-error` : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setEditing(true); onChange(event.target.value); } };
  return <Field>
    <div className="flex items-center justify-between gap-2">
      <FieldLabel htmlFor={source ? id : undefined} id={`${id}-label`}>{label}</FieldLabel>
      {(math || editing) && <Button type="button" variant="ghost" size="sm" aria-label={editing ? `Preview ${label}` : `Edit ${label} source`}
        onClick={() => { if (editing) onChange(normalize(value)); setEditing(!editing); }}>{editing ? "Done" : "Edit source"}</Button>}
    </div>
    {source ? multiline ? <Textarea {...props} rows={3} maxLength={label === "Model answer" ? 10_000 : undefined} /> : <Input {...props} />
      : <div role="group" dir={mathDirection(normalize(value))} aria-labelledby={`${id}-label`} className="min-w-0 max-w-full overflow-x-auto rounded-md bg-muted/40 px-3 py-4"><MathText value={normalize(value)} className="block" /></div>}
    {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
  </Field>;
}
