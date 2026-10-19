"use client";

import { studentsRootKey } from "../../records/queries";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { IconAlertTriangle, IconChevronDown, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent, ComboboxEmpty, ComboboxItem,
  ComboboxList, ComboboxValue, useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAcademyScope } from "@/modules/auth";
import { groupListQueryKey, loadGroups } from "@/modules/groups";

import { generateStudentCodes, previewStudentCodeGeneration } from "../actions";
import { newRequestKey } from "../request-key";
import {
  DEFAULT_GENERATION_OPTIONS,
  type GenerationMode, type GenerationOptions, type GenerationPreview, type StudentCodeFailure,
} from "../types";
import { NumberInput } from "@/components/shared/app-input";

type Props = {
  academyId: string;
  enabled: boolean;
  /** Refreshes the summary whenever formats or activation change. */
  settingsVersion: number;
  levels: { levelId: string; name: string }[];
};

type Option = { value: string; label: string; hint?: string };

/** A confirmed request, kept so a retry after an unknown outcome reuses its key and payload. */
type Attempt = { mode: GenerationMode; ids: string[]; options: GenerationOptions; expectedVersion: number; previewToken: string; requestKey: string };

const MODE_LABELS: Record<GenerationMode, string> = { all: "All students", levels: "Levels", groups: "Groups" };
const PARITY_LABELS: Record<GenerationOptions["parity"], string> = { any: "All numbers", even: "Even only", odd: "Odd only" };

/** Reads a whole number from a text field; empty is `empty`, anything else outside the range is null. */
function wholeNumber(text: string, min: number, max: number): number | "empty" | null {
  const value = text.trim();
  if (value === "") return "empty";
  if (!/^\d{1,9}$/.test(value)) return null;
  const number = Number(value);
  return number >= min && number <= max ? number : null;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Generates missing codes for everyone, chosen levels, or chosen groups in the open academic year. */
export function BulkStudentCodes({ academyId, enabled, settingsVersion, levels }: Props) {
  const isCurrentAcademy = useAcademyScope();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<GenerationMode>("all");
  const [levelIds, setLevelIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [startText, setStartText] = useState("");
  const [stepText, setStepText] = useState("1");
  const [parity, setParity] = useState<GenerationOptions["parity"]>("any");
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [unknown, setUnknown] = useState<Attempt | null>(null);

  const groupsQuery = useQuery({
    queryKey: groupListQueryKey(academyId, false),
    queryFn: () => loadGroups(academyId),
    enabled: enabled && mode === "groups",
  });
  const levelNames = Object.fromEntries(levels.map((level) => [level.levelId, level.name]));
  const levelOptions: Option[] = levels.map((level) => ({ value: level.levelId, label: level.name }));
  const groupOptions: Option[] = (groupsQuery.data?.groups ?? []).map((group) => ({
    value: group.id, label: group.name, hint: levelNames[group.level_id] ?? group.level_id,
  }));

  const ids = [...(mode === "levels" ? levelIds : mode === "groups" ? groupIds : [])].sort();
  const start = wholeNumber(startText, 1, 99999999);
  const step = wholeNumber(stepText, 1, 1000);
  const optionErrors = {
    start: start === null ? "Enter a number from 1 to 99,999,999, or leave it empty." : "",
    step: step === null || step === "empty" ? "Enter a number from 1 to 1,000." : "",
  };
  const parsedOptions: GenerationOptions | null = optionErrors.start || optionErrors.step ? null : {
    start: start === "empty" ? null : (start as number),
    step: step as number,
    parity,
  };
  const optionsKey = parsedOptions ? JSON.stringify(parsedOptions) : "";
  const debouncedKey = useDebounced(optionsKey);
  const options: GenerationOptions = parsedOptions && debouncedKey === optionsKey ? parsedOptions : DEFAULT_GENERATION_OPTIONS;
  const optionsReady = Boolean(parsedOptions) && debouncedKey === optionsKey;
  const ready = enabled && optionsReady && (mode === "all" || ids.length > 0);
  const previewQuery = useQuery<GenerationPreview, StudentCodeFailure>({
    queryKey: ["student-codes", academyId, "generation", settingsVersion, mode, ids, options],
    queryFn: async () => {
      const response = await previewStudentCodeGeneration({ academyId, mode, ids, options });
      if (!response.ok) throw response;
      return response.data;
    },
    enabled: ready,
    retry: false,
    placeholderData: keepPreviousData,
  });
  // Keep showing the last summary while new options load; it just can't be confirmed until it matches.
  const preview = enabled && (mode === "all" || ids.length > 0) ? previewQuery.data : undefined;
  const current = ready && !previewQuery.isPlaceholderData && !previewQuery.isFetching;
  const blocked = !current || !preview || preview.missing === 0 || preview.missingFormat.length > 0
    || preview.patterns.some((pattern) => pattern.available < pattern.missing);

  function changeScope(apply: () => void) {
    apply();
    setError("");
    setUnknown(null);
  }

  const noteParts = [
    options.start ? `starting from ${options.start}` : "",
    options.step > 1 ? `increasing by ${options.step}` : "",
    options.parity !== "any" ? `${options.parity} numbers only` : "",
  ].filter(Boolean);
  const optionsNote = noteParts.length > 0 ? ` (${noteParts.join(", ")})` : "";

  function scopeLabel() {
    if (mode === "all") return "all students";
    const names = mode === "levels"
      ? ids.map((id) => levelNames[id] ?? id)
      : ids.map((id) => groupOptions.find((option) => option.value === id)?.label ?? "a group");
    return names.join(", ");
  }

  async function run(attempt: Attempt) {
    if (running) return;
    setRunning(true);
    setError("");
    try {
      const response = await generateStudentCodes({ academyId, ...attempt });
      if (!isCurrentAcademy(academyId)) return;
      if (!response.ok && response.code === "unavailable") {
        setUnknown(attempt);
        return;
      }
      setUnknown(null);
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ["student-codes", academyId] });
      void queryClient.invalidateQueries({ queryKey: [...studentsRootKey(academyId), "list"] });
      if (!response.ok) {
        setError(response.message);
        return;
      }
      const { assigned } = response.data;
      toast.success(assigned === 0 ? "No codes were missing." : `Generated ${assigned.toLocaleString("en")} ${assigned === 1 ? "code" : "codes"}.`);
    } catch {
      if (isCurrentAcademy(academyId)) setUnknown(attempt);
    } finally {
      setRunning(false);
    }
  }

  function confirm() {
    if (!preview) return;
    void run({ mode, ids, options, expectedVersion: preview.settingsVersion, previewToken: preview.token, requestKey: newRequestKey() });
  }

  let summary: React.ReactNode = null;
  if (!enabled) {
    summary = null;
  } else if (mode !== "all" && ids.length === 0) {
    summary = <p className="text-sm text-muted-foreground text-center">Choose at least one {mode === "levels" ? "level" : "group"}.</p>;
  } else if (!preview && !parsedOptions) {
    summary = <p className="text-sm text-muted-foreground text-center">Fix the numbering options to see a summary.</p>;
  } else if (!preview && (previewQuery.isPending || !optionsReady)) {
    summary = <Skeleton className="h-20 w-full" />;
  } else if (previewQuery.isError && ready) {
    const failure = previewQuery.error;
    summary = (
      <Alert variant="destructive">
        <IconAlertTriangle aria-hidden="true" />
        <AlertTitle>{failure.code === "year_unavailable" ? "No open academic year" : "Couldn’t load the summary"}</AlertTitle>
        <AlertDescription>
          {failure.code === "year_unavailable" ? "Codes can only be generated in an open academic year." : failure.message}
          {failure.code !== "year_unavailable" && (
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void previewQuery.refetch()}>Try again</Button>
          )}
        </AlertDescription>
      </Alert>
    );
  } else if (preview) {
    summary = <div className={cn("transition-opacity", !current && "opacity-60")}><Summary preview={preview} levelNames={levelNames} /></div>;
  }

  return (
    <div>
      <p className="text-muted-foreground font-medium pb-1">Bulk generation</p>
      <Card aria-disabled={!enabled} className={cn("transition-opacity", !enabled && "opacity-50")}>
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="contents">
        <CardContent className="flex flex-col gap-6">
          <fieldset disabled={!enabled || running} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
            <Tabs value={mode} onValueChange={(value) => changeScope(() => setMode(value as GenerationMode))}>
              <TabsList className="w-full">
                {(Object.keys(MODE_LABELS) as GenerationMode[]).map((value) => (
                  <TabsTrigger key={value} value={value}>{MODE_LABELS[value]}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {mode === "levels" && (
              <ScopePicker
                label="Levels"
                placeholder="Choose levels"
                items={levelOptions}
                value={levelIds}
                disabled={!enabled || running}
                onChange={(next) => changeScope(() => setLevelIds(next))}
              />
            )}
            {mode === "groups" && (
              groupsQuery.isError ? (
                <FieldError>Couldn’t load groups. Check your connection and try again.</FieldError>
              ) : (
                <ScopePicker
                  label="Groups"
                  placeholder={groupsQuery.isPending ? "Loading groups…" : "Choose groups"}
                  items={groupOptions}
                  value={groupIds}
                  disabled={!enabled || running || groupsQuery.isPending}
                  onChange={(next) => changeScope(() => setGroupIds(next))}
                />
              )
            )}
            </fieldset>

            {summary}

          {error && <FieldError>{error}</FieldError>}
        </CardContent>
        <CardFooter className="justify-between gap-2">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className=" text-muted-foreground" disabled={!enabled}>
              Advanced
              <IconChevronDown aria-hidden="true" data-icon="inline-end" className={advancedOpen ? "rotate-180" : undefined} />
            </Button>
          </CollapsibleTrigger>
          <Button type="button" disabled={!enabled || running || blocked} onClick={() => { setError(""); setConfirming(true); }}>
            {preview && preview.missing > 0
              ? `Generate ${preview.missing.toLocaleString("en")} ${preview.missing === 1 ? "code" : "codes"}`
              : "Generate codes"}
          </Button>
        </CardFooter>
        <CollapsibleContent className="px-4 pb-2">
          <fieldset disabled={!enabled || running} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(optionErrors.start)} className="gap-2">
                <FieldLabel htmlFor="bulk-start">Start from</FieldLabel>
                <Input
                  id="bulk-start" inputMode="numeric" placeholder="Continue after the last code" className="font-mono"
                  value={startText} aria-invalid={Boolean(optionErrors.start)}
                  onChange={(event) => changeScope(() => setStartText(event.target.value))}
                />
                {optionErrors.start && <FieldError>{optionErrors.start}</FieldError>}
              </Field>
              <Field data-invalid={Boolean(optionErrors.step)} className="gap-2">
                <FieldLabel htmlFor="bulk-step">Increment</FieldLabel>
                <NumberInput
                  id="bulk-step" inputMode="numeric"  className="font-mono"
                  value={stepText} aria-invalid={Boolean(optionErrors.step)}
                  onChange={(event) => changeScope(() => setStepText(event.target.value))}
                />
                {optionErrors.step && <FieldError>{optionErrors.step}</FieldError>}
              </Field>
            </div>
            <Field className="gap-2">
              <FieldLabel>Numbers</FieldLabel>
              <Tabs value={parity} onValueChange={(value) => changeScope(() => setParity(value as GenerationOptions["parity"]))}>
                <TabsList className="w-full">
                  {(Object.keys(PARITY_LABELS) as GenerationOptions["parity"][]).map((value) => (
                    <TabsTrigger key={value} value={value}>{PARITY_LABELS[value]}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </Field>
          </fieldset>
        </CollapsibleContent>
        </Collapsible>
      </Card>

      <AlertDialog open={confirming} onOpenChange={(open) => { if (!open && !running) { setConfirming(false); setUnknown(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Generate {preview?.missing.toLocaleString("en")} {preview?.missing === 1 ? "code" : "codes"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Students in {scopeLabel()} without a code get the next code of their level’s format{optionsNote}. Existing codes stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {unknown && (
            <p role="alert" className="text-sm text-destructive">
              We couldn’t confirm whether the codes were generated. Try again; it won’t generate them twice.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
            <Button type="button" disabled={running} onClick={() => (unknown ? void run(unknown) : confirm())}>
              {running && <IconLoader2 aria-hidden="true" data-icon="inline-start" className="animate-spin" />}
              {running ? "Generating…" : unknown ? "Try again" : "Generate"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Summary({ preview, levelNames }: { preview: GenerationPreview; levelNames: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-4">
      {preview.missing === 0 ? (
        <p className="text-sm text-muted-foreground text-center">
          {preview.targets === 0 ? "No active students here." : "Every student here already has a code."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {preview.patterns.map((pattern) => {
            const short = pattern.available < pattern.missing;
            return (
              <li key={pattern.pattern} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                <div className="flex min-w-0 flex-col">
                  <span className="font-mono">{pattern.pattern}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {pattern.levelIds.map((id) => levelNames[id] ?? id).join(", ")}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className={cn(short && "text-destructive")}>
                    {short
                      ? `Only ${Math.max(pattern.available, 0).toLocaleString("en")} left for ${pattern.missing.toLocaleString("en")}`
                      : `${pattern.missing.toLocaleString("en")} to generate`}
                  </span>
                  {pattern.examples.length > 0 && (
                    <span className="font-mono text-xs text-muted-foreground">e.g. {pattern.examples.slice(0, 2).join(", ")}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {preview.missingFormat.length > 0 && (
        <Alert variant="destructive">
          <IconAlertTriangle aria-hidden="true" />
          <AlertTitle>Some levels have no format</AlertTitle>
          <AlertDescription>
            Set a format for {preview.missingFormat.map((entry) => `${levelNames[entry.levelId] ?? entry.levelId} (${entry.missing.toLocaleString("en")})`).join(", ")} to generate their codes.
          </AlertDescription>
        </Alert>
      )}
      {preview.patterns.some((pattern) => pattern.available < pattern.missing) && (
        <Alert variant="destructive">
          <IconAlertTriangle aria-hidden="true" />
          <AlertTitle>Not enough codes left</AlertTitle>
          <AlertDescription>Use a format with more # digits for these levels. Nothing is generated until every student can get a code.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function ScopePicker({ label, placeholder, items, value, disabled, onChange }: {
  label: string;
  placeholder: string;
  items: Option[];
  value: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const anchor = useComboboxAnchor();
  const selected = items.filter((item) => value.includes(item.value));
  return (
    <Combobox
      multiple
      autoHighlight
      disabled={disabled}
      items={items}
      value={selected}
      onValueChange={(next: Option[]) => onChange(next.map((option) => option.value))}
      itemToStringLabel={(option: Option) => option.label}
      isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
    >
      <ComboboxChips ref={anchor} className="w-full">
        <ComboboxValue>
          {(values: Option[]) => (
            <>
              {values.map((option) => <ComboboxChip key={option.value}>{option.label}</ComboboxChip>)}
              <ComboboxChipsInput placeholder={values.length > 0 ? "" : placeholder} aria-label={label} />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        <ComboboxList>
          {(option: Option) => (
            <ComboboxItem key={option.value} value={option}>
              <span className="flex-1 truncate">{option.label}</span>
              {option.hint && <span className="text-xs text-muted-foreground">{option.hint}</span>}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
