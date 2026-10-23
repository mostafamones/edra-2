"use client";

import { useState } from "react";
import { IconInfoCircle, IconListNumbers, IconRefresh } from "@tabler/icons-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAcademyScope } from "@/modules/auth";

import { saveStudentCodeSettings } from "../actions";
import { parseStudentCodePattern } from "../pattern";
import type { StudentCodeSettings } from "../types";
import { settingsFieldErrors, studentCodeSettingsInputSchema } from "../validation";
import { PatternExamples } from "./examples";

type Props = {
  academyId: string;
  /** The settings this draft started from; the parent re-mounts the editor when they change. */
  settings: StudentCodeSettings;
  levels: { levelId: string; name: string; students?: number }[];
  onSaved: (settings: StudentCodeSettings) => void;
  /** Discards the draft and loads the latest saved settings. */
  onReload: () => void;
};

/** One format for the whole academy, or one per level; never both. */
type Mode = "academy" | "levels";

export function StudentCodeSettingsEditor({ academyId, settings, levels, onSaved, onReload }: Props) {
  const isCurrentAcademy = useAcademyScope();
  const savedOverrides = Object.fromEntries(settings.levels.map((level) => [level.levelId, level.pattern]));
  const savedMode: Mode = settings.levels.length > 0 ? "levels" : "academy";
  const [mode, setMode] = useState<Mode>(savedMode);
  const [defaultPattern, setDefaultPattern] = useState(settings.defaultPattern ?? "");
  const [overrides, setOverrides] = useState<Record<string, string>>(savedOverrides);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState(false);

  const levelEntries = (source: Record<string, string>) =>
    levels.flatMap(({ levelId }) => source[levelId]?.trim() ? [{ levelId, pattern: source[levelId] }] : []);
  const draft = mode === "levels"
    ? { defaultPattern: "", levels: levelEntries(overrides) }
    : { defaultPattern, levels: [] };
  const dirty =
    canonical(draft.defaultPattern) !== (mode === "academy" ? settings.defaultPattern ?? "" : "")
    || JSON.stringify(draft.levels.map((l) => [l.levelId, canonical(l.pattern)]))
      !== JSON.stringify(levelEntries(savedOverrides).map((l) => [l.levelId, l.pattern]));

  function clearField(key: string) {
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function discard() {
    setMode(savedMode);
    setDefaultPattern(settings.defaultPattern ?? "");
    setOverrides(savedOverrides);
    setFieldErrors({});
    setError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !dirty) return;
    setError("");
    if (settings.enabled && mode === "levels") {
      const missing = Object.fromEntries(
        levels.filter(({ levelId }) => !overrides[levelId]?.trim()).map(({ levelId }) => [`level:${levelId}`, "Enter a format for this level."]),
      );
      if (Object.keys(missing).length > 0) {
        setFieldErrors(missing);
        return;
      }
    }
    const parsed = studentCodeSettingsInputSchema.safeParse({ academyId, expectedVersion: settings.version, enabled: settings.enabled, ...draft });
    if (!parsed.success) {
      setFieldErrors(settingsFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const result = await saveStudentCodeSettings(parsed.data);
      if (!isCurrentAcademy(academyId)) return;
      if (!result.ok) {
        if (result.code === "stale_settings") setStale(true);
        else setError(result.message);
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        // A failing field the current tab doesn't show would otherwise leave only a vague message.
        if (mode === "levels" && result.fieldErrors?.defaultPattern) setError(result.fieldErrors.defaultPattern);
        return;
      }
      toast.success("Formats saved.");
      onSaved({
        enabled: settings.enabled,
        defaultPattern: parsed.data.defaultPattern.trim() ? canonical(parsed.data.defaultPattern) : null,
        version: result.data.version,
        levels: parsed.data.levels.map(({ levelId, pattern }) => ({ levelId, pattern: canonical(pattern) })),
      });
    } catch {
      setError("Could not save student code settings. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="flex h-8 items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-base font-semibold">Formats</h3>
          <FormatHint />
        </div>
        <Tabs value={mode} onValueChange={(value) => { setMode(value as Mode); setFieldErrors({}); }}>
          <TabsList className="h-8">
            <TabsTrigger value="academy" disabled={saving || !settings.enabled}>Whole academy</TabsTrigger>
            <TabsTrigger value="levels" disabled={saving || !settings.enabled || levels.length === 0}>Per level</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <fieldset disabled={saving || !settings.enabled} className="m-0 min-w-0 border-0 p-0">
        {mode === "academy" ? (
          <Field data-invalid={Boolean(fieldErrors.defaultPattern)} className="gap-2">
            <FieldLabel htmlFor="student-codes-default" className="sr-only">Code format</FieldLabel>
            <Input
              id="student-codes-default"
              value={defaultPattern}
              onChange={(event) => { setDefaultPattern(event.target.value); clearField("defaultPattern"); }}
              placeholder="####"
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              aria-invalid={Boolean(fieldErrors.defaultPattern)}
            />
            {fieldErrors.defaultPattern ? <FieldError>{fieldErrors.defaultPattern}</FieldError> : <PatternExamples pattern={defaultPattern} />}
          </Field>
        ) : levels.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><IconListNumbers aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>No levels yet</EmptyTitle>
              <EmptyDescription>Add levels in Academic structure first.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {levels.map(({ levelId, name, students }) => {
              const key = `level:${levelId}`;
              const value = overrides[levelId] ?? "";
              return (
                <Field key={levelId} data-invalid={Boolean(fieldErrors[key])} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-start gap-x-4 gap-y-1">
                  <div className="flex h-10 min-w-0 flex-col justify-center">
                    <FieldLabel htmlFor={`student-codes-${levelId}`} className="truncate leading-tight">{name}</FieldLabel>
                    {students !== undefined && (
                      <span className="text-xs leading-tight text-muted-foreground">
                        {students.toLocaleString("en")} {students === 1 ? "student" : "students"}
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col gap-2">
                    <InputGroup>
                      <InputGroupInput
                        id={`student-codes-${levelId}`}
                        value={value}
                        onChange={(event) => { setOverrides((current) => ({ ...current, [levelId]: event.target.value })); clearField(key); }}
                        placeholder="ST2###"
                        maxLength={40}
                        autoComplete="off"
                        spellCheck={false}
                        className="font-mono"
                        aria-invalid={Boolean(fieldErrors[key])}
                      />
                      {!fieldErrors[key] && value.trim() && (
                        <InputGroupAddon align="inline-end"><PatternExamples pattern={value} inline /></InputGroupAddon>
                      )}
                    </InputGroup>
                    {fieldErrors[key] && <FieldError>{fieldErrors[key]}</FieldError>}
                  </div>
                </Field>
              );
            })}
          </div>
        )}
      </fieldset>

      {stale && (
        <Alert variant="destructive">
          <AlertTitle>These settings changed elsewhere</AlertTitle>
          <AlertDescription>Someone else saved first, so your changes weren’t saved. Reloading discards your edits.</AlertDescription>
          <div className="col-start-2 mt-2">
            <Button type="button" variant="outline" size="sm" onClick={onReload}>
              <IconRefresh aria-hidden="true" data-icon="inline-start" />Reload settings
            </Button>
          </div>
        </Alert>
      )}
      {error && <FieldError>{error}</FieldError>}

      {dirty && (
        <div className="flex justify-end gap-2 animate-in fade-in-0">
          <Button type="button" variant="destructive" onClick={discard} disabled={saving || !settings.enabled}>Discard</Button>
          <Button type="submit" disabled={saving || stale || !settings.enabled}>{saving ? "Saving…" : "Save formats"}</Button>
        </div>
      )}
    </form>
  );
}

function FormatHint() {
  return <Hint label="About formats">Optional text, then 1–8 # for the number. #### gives 0001, 0002; ST2### gives ST2001. Examples don’t reserve codes.</Hint>;
}

function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} className="text-muted-foreground hover:text-foreground">
          <IconInfoCircle aria-hidden="true" className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{children}</TooltipContent>
    </Tooltip>
  );
}

function canonical(pattern: string) {
  const trimmed = pattern.trim();
  if (!trimmed) return "";
  const parsed = parseStudentCodePattern(pattern);
  return parsed.ok ? parsed.value.pattern : trimmed;
}
