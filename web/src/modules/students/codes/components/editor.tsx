"use client";

import { useState } from "react";
import { IconChevronDown, IconInfoCircle, IconListNumbers, IconRefresh } from "@tabler/icons-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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
  const [helpOpen, setHelpOpen] = useState(false);

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
    <form onSubmit={submit} noValidate>
      <p className="text-muted-foreground font-medium pb-1">Formats</p>
      <Card aria-disabled={!settings.enabled} className={cn("transition-opacity", !settings.enabled && "opacity-50")}>
        <Collapsible open={helpOpen} onOpenChange={setHelpOpen} className="contents">
          <CardContent className="flex flex-col gap-6">
            <fieldset disabled={saving || !settings.enabled} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
              <Tabs value={mode} onValueChange={(value) => { setMode(value as Mode); setFieldErrors({}); }}>
                <TabsList className="w-full">
                  <TabsTrigger value="academy">Whole academy</TabsTrigger>
                  <TabsTrigger value="levels" disabled={levels.length === 0}>Per level</TabsTrigger>
                </TabsList>
              </Tabs>

              {mode === "academy" ? (
                <Field data-invalid={Boolean(fieldErrors.defaultPattern)} className="gap-2">
                  <div className="flex items-center gap-1.5">
                    <FieldLabel htmlFor="student-codes-default">Format</FieldLabel>
                    <FormatHint />
                  </div>
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
                <div className="flex flex-col gap-4">
                  {levels.map(({ levelId, name, students }) => {
                    const key = `level:${levelId}`;
                    const value = overrides[levelId] ?? "";
                    return (
                      <Field key={levelId} data-invalid={Boolean(fieldErrors[key])} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] items-start gap-x-4 gap-y-1">
                        <div className="flex h-9 flex-col justify-center">
                          <FieldLabel htmlFor={`student-codes-${levelId}`} className="leading-tight">{name}</FieldLabel>
                          {students !== undefined && (
                            <span className="text-xs leading-tight text-muted-foreground">
                              {students.toLocaleString("en")} {students === 1 ? "student" : "students"}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
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
          </CardContent>
          <CardFooter className="justify-between gap-2">
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
                How formats work
                <IconChevronDown aria-hidden="true" data-icon="inline-end" className={helpOpen ? "rotate-180" : undefined} />
              </Button>
            </CollapsibleTrigger>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={discard} disabled={!dirty || saving || !settings.enabled}>Discard</Button>
              <Button type="submit" disabled={!dirty || saving || stale || !settings.enabled}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </CardFooter>
          <CollapsibleContent className="px-6 pb-2">
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
                <li>Optional text (letters, digits, hyphens), then 1–8 <span className="font-mono">#</span> for the number.</li>
                <li><span className="font-mono">####</span> gives 0001, 0002, …; <span className="font-mono">ST2###</span> gives ST2001, ST2002, ….</li>
                <li>Examples are illustrations only and don’t reserve codes.</li>
              </ul>
            </CollapsibleContent>
        </Collapsible>
      </Card>
    </form>
  );
}

function FormatHint() {
  return <Hint label="About formats">Text, then # for the number. #### gives 0001, 0002; ST2### gives ST2001.</Hint>;
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
