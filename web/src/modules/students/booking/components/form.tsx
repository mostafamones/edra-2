"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, Loading03Icon, Tick02Icon } from "@hugeicons/core-free-icons";

import { PhoneInput, TextInput } from "@/components/shared/app-input";
import { ChoiceCards } from "@/components/shared/choice-cards";
import { studentBookingHref } from "@/lib/routing";
import { newUuid } from "@/lib/uuid";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { GroupSchedule, SeatsLeft } from "../../enrollment/components/group-schedule";
import type { BookingPrefill } from "../../enrollment/types";
import { PARTICIPATION_LABELS, PARTICIPATION_TYPES } from "../../records/validation";
import { submitStudentBooking } from "../actions";
import type { BookingField, BookingForm, BookingOutcome, OpenBookingForm } from "../types";
import { bookingLevels, bookingProgram, bookingTracks, keepAvailableChoices, NO_GROUP, type BookingValues } from "../validation";

const STATES = {
  closed: "Registration is closed",
  unavailable: "Registration isn’t available right now",
  invalid: "This booking link isn’t valid",
  error: "We couldn’t load this form",
} as const;

const MESSAGES: Partial<Record<BookingOutcome["result"], string>> = {
  already_registered: "This student number is already registered for this academic year.",
  group_full: "That group just filled up. Choose another option.",
  invalid_choice: "That choice is no longer available. Choose again.",
  changed: "The form was updated. Check your choices and submit again.",
  rate_limited: "Too many attempts. Wait a few minutes, then try again.",
  staff_help: "We couldn’t register this student automatically. Contact the academy staff.",
  unavailable: "Registration isn’t available right now.",
  invalid: "This booking link isn’t valid.",
  error: "Couldn’t submit the form. Try again.",
};

// Matches the form's inputs: their height and muted fill instead of the select's default.
const SELECT = "w-full bg-muted/60 shadow-none hover:bg-muted data-[size=default]:h-10 dark:bg-muted/60 dark:hover:bg-muted";

/** States after which the form must be re-read from the server before another attempt. */
const REFRESH: readonly BookingOutcome["result"][] = ["group_full", "invalid_choice", "changed"];

type Props = {
  token: string;
  form: BookingForm;
  /** Known account details for a signed-in first-time student. */
  prefill?: BookingPrefill | null;
  /** The booking link's sign-in entry, offered to signed-out visitors. */
  signInHref?: string | null;
};

/** The public booking form: record-only registration for the academy's current year. */
export function StudentBookingForm({ token, form, prefill, signInHref }: Props) {
  if (form.result !== "open") {
    return (
      <Shell title={form.result === "error" ? STATES.error : STATES[form.result]} academy={"academy" in form ? form.academy.name : null} />
    );
  }
  return <OpenForm token={token} form={form} prefill={prefill ?? null} signInHref={signInHref ?? null} />;
}

/** The open form as students see it, without submission, for staff previews. */
export function BookingFormPreview({ form }: { form: OpenBookingForm }) {
  return <OpenForm token="" form={form} prefill={null} signInHref={null} preview />;
}

function OpenForm({ token, form, prefill, signInHref, preview = false }: {
  token: string; form: OpenBookingForm; prefill: BookingPrefill | null; signInHref: string | null; preview?: boolean;
}) {
  const router = useRouter();
  const levels = bookingLevels(form.programs);
  const [entered, setValues] = useState<BookingValues>(() => ({
    fullName: prefill?.fullName ?? "",
    studentPhone: prefill?.studentPhone ?? "",
    parentPhone: prefill?.parentPhone ?? "",
    levelId: prefill?.levelId ?? (levels.length === 1 ? levels[0].id : ""),
    trackId: "",
    groupId: "",
    participationType: "",
  }));
  const [errors, setErrors] = useState<Partial<Record<BookingField, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  // One key per payload: an identical retry after a lost response returns the recorded registration.
  const retryKey = useRef(newUuid());

  // After a refresh, keep entered details and drop choices the form no longer offers.
  const values = keepAvailableChoices(entered, form);

  const tracks = bookingTracks(form.programs, values.levelId);
  const program = bookingProgram(form.programs, values.levelId, values.trackId);
  const openGroups = program?.groups.filter((group) => !group.full) ?? [];
  const fullGroups = program?.groups.filter((group) => group.full) ?? [];

  function update(next: Partial<BookingValues>) {
    retryKey.current = newUuid();
    setValues({ ...values, ...next });
    setErrors((current) => {
      const cleared = { ...current };
      for (const key of Object.keys(next) as BookingField[]) delete cleared[key];
      return cleared;
    });
    setMessage(null);
  }

  function localErrors() {
    const found: Partial<Record<BookingField, string>> = {};
    if (!values.levelId) found.levelId = "Choose a level.";
    else if (tracks.length > 0 && !values.trackId) found.trackId = "Choose a track.";
    else if (program && !values.groupId && !form.groupOptional) found.groupId = "Choose a group.";
    if (form.participation === "choice" && !values.participationType) found.participationType = "Choose the student type.";
    return found;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || preview) return;
    const found = localErrors();
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setBusy(true);
    setMessage(null);
    let outcome: BookingOutcome;
    try {
      outcome = await submitStudentBooking(token, {
        yearId: form.year.id,
        revision: form.revision,
        retryKey: retryKey.current,
        fullName: values.fullName,
        studentPhone: values.studentPhone,
        parentPhone: values.parentPhone,
        levelId: values.levelId,
        trackId: values.trackId || null,
        groupId: values.groupId === NO_GROUP ? null : values.groupId || null,
        participationType: form.participation === "choice" ? values.participationType || null : null,
      });
    } catch {
      outcome = { result: "error" };
    }
    if (outcome.result === "registered") {
      setDone(values.fullName.trim());
      return;
    }
    if (outcome.result === "continue") {
      // Signed-in students with an academy relationship continue through verified onboarding.
      window.location.assign(studentBookingHref(token, "/join"));
      return;
    }
    if (outcome.result === "closed") {
      router.refresh();
    } else if (outcome.result === "validation") {
      setErrors(outcome.fieldErrors);
    } else {
      setMessage(MESSAGES[outcome.result] ?? MESSAGES.error!);
      if (REFRESH.includes(outcome.result)) router.refresh();
    }
    setBusy(false);
  }

  if (done !== null) {
    return (
      <Shell title="You’re registered" academy={form.academy.name}>
        <p className="flex items-center gap-2 text-sm" role="status">
          <HugeiconsIcon icon={Tick02Icon} strokeWidth={1.5} className="size-4 text-primary" aria-hidden="true" />
          {done}
        </p>
      </Shell>
    );
  }

  const fieldError = (field: BookingField) => errors[field] && <FieldError id={`booking-${field}-error`}>{errors[field]}</FieldError>;
  const invalid = (field: BookingField) => ({
    "aria-invalid": Boolean(errors[field]) || undefined,
    "aria-describedby": errors[field] ? `booking-${field}-error` : undefined,
  });

  return (
    <Shell title={<><span className="font-normal">Register with</span> {form.academy.name}</>} preview={preview} action={signInHref && (
      <Button variant="ghost" size="sm" asChild><a href={signInHref}>Sign in</a></Button>
    )}>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
        <FieldGroup>
          <TextInput label="Student name" autoComplete="name" value={values.fullName} disabled={busy} error={errors.fullName}
            onChange={(event) => update({ fullName: event.target.value })} />
          <PhoneInput label="Student mobile" value={values.studentPhone} disabled={busy} error={errors.studentPhone}
            onChange={(event) => update({ studentPhone: event.target.value })} />
          <PhoneInput label="Parent or guardian mobile" autoComplete="off" value={values.parentPhone} disabled={busy} error={errors.parentPhone}
            onChange={(event) => update({ parentPhone: event.target.value })} />

          <div className={tracks.length > 0 ? "grid gap-3 sm:grid-cols-2" : "contents"}>
            <Field data-invalid={Boolean(errors.levelId) || undefined}>
              <FieldLabel htmlFor="booking-level">Level</FieldLabel>
              <Select value={values.levelId} disabled={busy} onValueChange={(levelId) => update({ levelId, trackId: "", groupId: "" })}>
                <SelectTrigger id="booking-level" className={SELECT} {...invalid("levelId")}><SelectValue placeholder="Choose a level" /></SelectTrigger>
                <SelectContent>
                  {levels.map((level) => <SelectItem key={level.id} value={level.id}>{level.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {fieldError("levelId")}
            </Field>

            {tracks.length > 0 && (
              <Field data-invalid={Boolean(errors.trackId) || undefined}>
                <FieldLabel htmlFor="booking-track">Track</FieldLabel>
                <Select value={values.trackId} disabled={busy} onValueChange={(trackId) => update({ trackId, groupId: "" })}>
                  <SelectTrigger id="booking-track" className={SELECT} {...invalid("trackId")}><SelectValue placeholder="Choose a track" /></SelectTrigger>
                  <SelectContent>
                    {tracks.map((track) => <SelectItem key={track.id} value={track.id}>{track.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {fieldError("trackId")}
              </Field>
            )}
          </div>

          {program && (openGroups.length > 0 || form.groupOptional) && (
            <FieldSet data-invalid={Boolean(errors.groupId) || undefined}>
              <FieldLegend variant="label">Group</FieldLegend>
              {openGroups.length > 0 && (
                <ChoiceCards name="booking-group" label="Group" value={values.groupId === NO_GROUP ? "" : values.groupId} disabled={busy} className="sm:grid-cols-1"
                  options={openGroups.map((group) => ({
                    value: group.id,
                    title: (
                      <span className="flex w-full items-center justify-between gap-3">
                        <span className="text-base font-semibold">{group.name}</span>
                        {group.seatsLeft != null && <SeatsLeft count={group.seatsLeft} />}
                      </span>
                    ),
                    description: group.slots.length ? <GroupSchedule slots={group.slots} /> : undefined,
                  }))}
                  onChange={(groupId) => update({ groupId })} />
              )}
              {form.groupOptional && (
                <>
                  {openGroups.length > 0 && <FieldSeparator>or</FieldSeparator>}
                  <ChoiceCards name="booking-group" label="No group" value={values.groupId === NO_GROUP ? NO_GROUP : ""} disabled={busy} className="sm:grid-cols-1"
                    options={[{ value: NO_GROUP, title: <span className="text-base font-semibold">No group</span> }]}
                    onChange={() => update({ groupId: NO_GROUP })} />
                </>
              )}
              {fullGroups.length > 0 && <p className="text-sm text-muted-foreground">Full: {fullGroups.map((group) => group.name).join(", ")}</p>}
              {fieldError("groupId")}
            </FieldSet>
          )}

          {form.participation === "choice" && (
            <FieldSet data-invalid={Boolean(errors.participationType) || undefined}>
              <FieldLegend variant="label">Student type</FieldLegend>
              <RadioGroup value={values.participationType} disabled={busy} onValueChange={(participationType) => update({ participationType })}
                className="grid-cols-2" {...invalid("participationType")}>
                {PARTICIPATION_TYPES.map((type) => (
                  <Field key={type} orientation="horizontal">
                    <RadioGroupItem id={`booking-type-${type}`} value={type} />
                    <FieldLabel htmlFor={`booking-type-${type}`} className="font-normal">{PARTICIPATION_LABELS[type]}</FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
              {fieldError("participationType")}
            </FieldSet>
          )}
        </FieldGroup>

        {message && (
          <Alert role="status">
            <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} aria-hidden="true" />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={busy || preview} className="w-full">
          {busy && <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}
          {busy ? "Registering…" : "Register"}
        </Button>
      </form>
    </Shell>
  );
}

function Shell({ title, academy, action, preview, children }: {
  title: React.ReactNode; academy?: string | null; action?: React.ReactNode; preview?: boolean; children?: React.ReactNode;
}) {
  if (preview) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-2xl font-semibold tracking-tight">{title}</p>
        {children}
      </div>
    );
  }
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            {academy && <p className="text-sm font-medium text-muted-foreground">{academy}</p>}
            <CardTitle className="text-2xl font-semibold tracking-tight"><h1>{title}</h1></CardTitle>
          </div>
          {action}
        </CardHeader>
        {children && <CardContent>{children}</CardContent>}
      </Card>
    </main>
  );
}
