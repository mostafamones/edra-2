"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconAlertCircle, IconWand } from "@tabler/icons-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAcademyScope } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";

import { changeStudentCode, peekNextStudentCode } from "../actions";
import { parseStudentCodePattern } from "../pattern";
import { fetchStudentCodeState, studentCodeQueryKeys } from "../queries";
import type { StudentCodeAction, StudentCodeState } from "../types";
import { newRequestKey } from "../request-key";
import { effectivePattern, useStudentCodeSettings } from "../use-settings";

export type CodeTarget = { id: string; fullName: string; levelId: string };

type Props = {
  academy: AcademyEntry;
  /** The student whose code is being managed; null closes the dialog. */
  target: CodeTarget | null;
  onClose: () => void;
};

/**
 * Assign, generate, or retire one student's code. Each button is its own committed change; nothing
 * here touches an open contact-edit draft, and a code is never replaced without retiring it first.
 */
export function StudentCodeDialog({ academy, target, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent showCloseButton={!busy} className="sm:max-w-md">
        {target && <DialogBody key={target.id} academy={academy} target={target} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  );
}

type BodyProps = { academy: AcademyEntry; target: CodeTarget; onClose: () => void; onBusyChange: (busy: boolean) => void };

function DialogBody({ academy, target, onClose, onBusyChange }: BodyProps) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const settings = useStudentCodeSettings(academy.id);
  const stateKey = studentCodeQueryKeys.state(academy.id, target.id);
  const query = useQuery({
    queryKey: stateKey,
    queryFn: ({ signal }) => fetchStudentCodeState(academy.id, target.id, signal),
    staleTime: Infinity,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  // Null until staff type: a coded student opens with the current number in the field.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [inputError, setInputError] = useState("");
  // On: the old code is retired and stays reserved. Off: it is released and can be given to anyone.
  const [retireOld, setRetireOld] = useState(true);
  const [pending, setPending] = useState<StudentCodeAction | null>(null);
  const [peeking, setPeeking] = useState(false);
  // Kept across retries of one attempt so a repeated submit replays instead of changing twice.
  const [firstKey] = useState(newRequestKey);
  const requestKey = useRef(firstKey);

  const state = query.data;
  const pattern = settings.data ? effectivePattern(settings.data, target.levelId) : null;
  const parsed = pattern ? parseStudentCodePattern(pattern) : null;
  const format = parsed?.ok ? parsed.value : null;
  const enabled = settings.data?.enabled ?? false;
  const busy = Boolean(pending) || peeking;
  const currentDigits = format && state?.code?.startsWith(format.prefix) && state.code.length === format.prefix.length + format.width
    ? state.code.slice(format.prefix.length)
    : "";
  const digits = draft ?? currentDigits;
  const setDigits = (value: string) => setDraft(value);
  /** The prefix is fixed by the level's format; staff only type the number, padded with zeros. */
  const fullCode = format && digits ? format.prefix + digits.padStart(format.width, "0") : "";

  async function run(action: StudentCodeAction, current: StudentCodeState) {
    if (busy) return;
    setError("");
    setInputError("");
    if (action !== "retire" && (!format || !fullCode || Number(digits) < 1)) {
      setInputError(`Enter a number from 1 to ${format ? format.capacity.toLocaleString("en") : ""}.`);
      return;
    }
    setPending(action); onBusyChange(true);
    try {
      const result = await changeStudentCode({
        academyId: academy.id, recordId: target.id, action, code: fullCode, expectedVersion: current.version, requestKey: requestKey.current,
      });
      if (!isCurrentAcademy(academy.id)) return;
      if (!result.ok) {
        if (result.code !== "unavailable") requestKey.current = newRequestKey();
        if (result.code === "stale_code" || result.code === "code_exists") {
          setDraft(null);
          void queryClient.invalidateQueries({ queryKey: stateKey });
        }
        if (result.code === "code_taken" || result.code === "invalid_format" || result.code === "validation") setInputError(result.message);
        else setError(result.message);
        return;
      }
      requestKey.current = newRequestKey();
      queryClient.setQueryData(stateKey, result.data);
      setDraft(null);
      toast.success(action === "retire" ? `Retired ${current.code}.` : `${target.fullName} now has code ${result.data.code}.`);
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(null); onBusyChange(false);
    }
  }

  /** Puts the next unused number in the field. Nothing is reserved or saved until the form is submitted. */
  async function suggest() {
    if (busy || !format) return;
    setError("");
    setInputError("");
    setPeeking(true);
    try {
      const result = await peekNextStudentCode(academy.id, target.id);
      if (!isCurrentAcademy(academy.id)) return;
      if (result.ok) setDigits(result.data.code.slice(format.prefix.length));
      else setInputError(result.message);
    } catch {
      setInputError("Something went wrong. Check your connection and try again.");
    } finally {
      setPeeking(false);
    }
  }

  function codeForm(action: "assign" | "replace", current: StudentCodeState, submitLabel: string, pendingLabel: string, extra?: React.ReactNode) {
    const submitAction: StudentCodeAction = action === "replace" && !retireOld ? "replace_release" : action;
    return (
      <form
        noValidate
        onSubmit={(event) => { event.preventDefault(); void run(submitAction, current); }}
        className="flex flex-col gap-4"
      >
        <Field data-invalid={Boolean(inputError)} className="gap-2">
          <FieldLabel htmlFor="student-code-input">Code</FieldLabel>
          <InputGroup>
            {format && format.prefix && <InputGroupAddon><InputGroupText className="font-mono">{format.prefix}</InputGroupText></InputGroupAddon>}
            <InputGroupInput
              id="student-code-input"
              value={digits}
              onChange={(event) => { setDigits(event.target.value.replace(/\D/g, "").slice(0, format?.width)); setInputError(""); }}
              onBlur={() => { if (format && digits) setDigits(digits.padStart(format.width, "0")); }}
              inputMode="numeric"
              placeholder={format ? "0".repeat(format.width - 1) + "1" : "No format set for this level"}
              maxLength={format?.width}
              autoComplete="off"
              autoFocus={action === "replace"}
              disabled={busy || !format}
              className="font-mono"
              aria-invalid={Boolean(inputError)}
            />
            <InputGroupAddon align="inline-end">
              <Tooltip>
                <TooltipTrigger asChild>
                  <InputGroupButton size="icon-xs" aria-label="Fill in the next number" disabled={busy || !format} onClick={() => void suggest()}>
                    <IconWand aria-hidden="true" />
                  </InputGroupButton>
                </TooltipTrigger>
                <TooltipContent>Fill in the next number</TooltipContent>
              </Tooltip>
            </InputGroupAddon>
          </InputGroup>
          {inputError && <FieldError>{inputError}</FieldError>}
        </Field>
        {extra}
        {error && <FieldError>{error}</FieldError>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy || !digits || !format || (action === "replace" && digits === currentDigits)}>
            {pending === submitAction ? pendingLabel : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    );
  }

  let content: React.ReactNode;
  if (query.isPending || settings.isPending) {
    content = <Skeleton className="h-24 w-full" />;
  } else if (query.isError || !state) {
    content = (
      <Alert variant="destructive">
        <IconAlertCircle aria-hidden="true" />
        <AlertTitle>Couldn’t load this student’s code</AlertTitle>
        <AlertDescription>
          Check your connection and try again.
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void query.refetch()}>Try again</Button>
        </AlertDescription>
      </Alert>
    );
  } else if (state.code && enabled) {
    content = codeForm(
      "replace", state, "Save", "Saving…",
      digits !== currentDigits && (
        <Field orientation="horizontal" className="items-center justify-between rounded-lg border px-3 py-2.5">
          <FieldLabel htmlFor="student-code-retire" className="font-normal">
            Retire <span className="font-mono font-medium">{state.code}</span>
            <span className="block text-xs text-muted-foreground">
              {retireOld ? "It can never be used again." : "It can be given to any student."}
            </span>
          </FieldLabel>
          <Switch id="student-code-retire" checked={retireOld} onCheckedChange={setRetireOld} disabled={busy} />
        </Field>
      ),
    );
  } else if (state.code) {
    content = (
      <>
        <p className="font-mono text-3xl font-semibold tracking-tight">{state.code}</p>
        <Alert>
          <IconAlertCircle aria-hidden="true" />
          <AlertTitle>Student codes are off</AlertTitle>
          <AlertDescription>Turn them on in Manage → Student codes to change this code.</AlertDescription>
        </Alert>
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </>
    );
  } else if (!enabled) {
    content = (
      <>
        <Alert>
          <IconAlertCircle aria-hidden="true" />
          <AlertTitle>Student codes are off</AlertTitle>
          <AlertDescription>Turn them on in Manage → Student codes to assign this student a code.</AlertDescription>
        </Alert>
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </>
    );
  } else {
    content = codeForm("assign", state, "Save", "Saving…");
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          <span className="font-semibold font-[Noto_Sans_Arabic] text-base">{target.fullName}</span>
          {"'s student code"}
        </DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-5">{content}</div>
    </>
  );
}
