"use client";

import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FIELD_LABELS, rowLabel, type MappingProblem } from "../mapping";
import {
  IMPORT_FIELDS, type CellValue, type ColumnMapping, type ImportField, type ParsedSource, type SourceColumn,
} from "../types";

type Props = {
  source: ParsedSource;
  headerIndex: number;
  onHeaderChange: (index: number) => void;
  onSheetChange: (sheet: string) => void;
  columns: SourceColumn[];
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  problems: MappingProblem[];
  /** Show problems only after a preview was attempted. */
  showProblems: boolean;
  disabled: boolean;
};

const NONE = "__none__";
const REQUIRED: ImportField[] = ["full_name", "student_phone", "parent_phone"];
const HEADER_CHOICES = 20;

const preview = (cell: CellValue | undefined) => {
  if (cell === undefined || cell === "") return "";
  if (cell === null) return "null";
  if (typeof cell === "string") return cell.length > 40 ? `${cell.slice(0, 40)}…` : cell;
  return `(${cell.problem})`;
};

/** Worksheet and header choice, and the column each field is read from. */
export function MappingPanel({
  source, headerIndex, onHeaderChange, onSheetChange, columns, mapping, onMappingChange, problems, showProblems, disabled,
}: Props) {
  const problemFor = (field: ImportField) => (showProblems ? problems.find((problem) => problem.field === field)?.message : undefined);

  return (
    <div className="flex flex-col gap-8">
      {(source.sheets.length > 1 || !source.columns) && (
        <FieldSet className="gap-4">
          <FieldGroup className="grid gap-5 sm:grid-cols-2">
            {source.sheets.length > 1 && (
              <Field>
                <FieldLabel htmlFor="import-sheet">Worksheet</FieldLabel>
                <Select value={source.sheet ?? ""} onValueChange={onSheetChange} disabled={disabled}>
                  <SelectTrigger id="import-sheet" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {source.sheets.map((sheet) => <SelectItem key={sheet} value={sheet}>{sheet}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {!source.columns && (
              <Field>
                <FieldLabel htmlFor="import-header">Header row</FieldLabel>
                <Select value={String(headerIndex)} onValueChange={(value) => onHeaderChange(Number(value))} disabled={disabled}>
                  <SelectTrigger id="import-header" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {source.records.slice(0, HEADER_CHOICES).map((record, index) => (
                      <SelectItem key={record.sourceRow} value={String(index)}>
                        <span className="truncate" dir="auto">
                          {rowLabel(source, record.sourceRow)}: {record.cells.map(preview).filter(Boolean).slice(0, 4).join(", ")}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </FieldGroup>
        </FieldSet>
      )}

      <FieldSet className="gap-4">
        <FieldLegend className="mb-3">Columns</FieldLegend>
        <FieldGroup className="gap-4">
          {IMPORT_FIELDS.map((field) => {
            const message = problemFor(field);
            return (
              <Field key={field} orientation="horizontal" data-invalid={Boolean(message) || undefined} className="items-start gap-4">
                <FieldLabel htmlFor={`import-map-${field}`} className="w-40 shrink-0 pt-2">
                  {FIELD_LABELS[field]}
                  {!REQUIRED.includes(field) && <span className="text-muted-foreground">(optional)</span>}
                </FieldLabel>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Select
                    value={mapping[field] ?? NONE}
                    disabled={disabled}
                    onValueChange={(next) => onMappingChange({ ...mapping, [field]: next === NONE ? null : next })}
                  >
                    <SelectTrigger id={`import-map-${field}`} className="w-full" aria-invalid={Boolean(message) || undefined}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not mapped</SelectItem>
                      {columns.map((column) => (
                        <SelectItem key={column.id} value={column.id}><span dir="auto">{column.label}</span></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError>{message}</FieldError>
                </div>
              </Field>
            );
          })}
        </FieldGroup>
        {showProblems && problems.some((problem) => problem.field === null) && (
          <FieldError>{problems.find((problem) => problem.field === null)?.message}</FieldError>
        )}
      </FieldSet>
    </div>
  );
}
