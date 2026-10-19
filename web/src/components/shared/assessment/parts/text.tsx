"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TextFieldProps } from "./config";

/** Question text and choices as plain text, for types without images. */
export function PlainTextField({ value, onChange, onBlur, multiline, readOnly, id, placeholder, className, "aria-label": label, "aria-invalid": invalid }: TextFieldProps) {
  return multiline ? (
    <Textarea id={id} rows={3} maxLength={5000} readOnly={readOnly} placeholder={placeholder} aria-label={label} aria-invalid={invalid} className={className}
      value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} />
  ) : (
    <Input id={id} maxLength={1000} readOnly={readOnly} placeholder={placeholder} aria-label={label} aria-invalid={invalid} className={className}
      value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} />
  );
}
