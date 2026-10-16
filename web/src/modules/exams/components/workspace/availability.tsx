"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconCalendarClock, IconLoader2 } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { academyDateTime, academyInstant, ACADEMY_TIME_ZONE, formatAcademyDateTime } from "@/lib/academy-time";
import { useAcademyScope } from "@/modules/auth";
import { setExamAvailability } from "../../actions";
import { examsRootKey } from "../../queries";
import type { Exam } from "../../types";

const ACTUAL_CLOSE_MS = 2 * 60 * 1000;

/**
 * Owner/Head Admin/Admin: the opening and scheduled closing times, entered in academy time and saved
 * as UTC. Actual closure is always two minutes after the scheduled close.
 */
export function AvailabilityDialog({ exam }: { exam: Exam }) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [open, setOpen] = useState(false);
  const opens = exam.opensAt ? academyDateTime(exam.opensAt) : null;
  const closes = exam.closesAt ? academyDateTime(exam.closesAt) : null;
  const [values, setValues] = useState({ opensDate: opens?.date ?? "", opensTime: opens?.time ?? "", closesDate: closes?.date ?? "", closesTime: closes?.time ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The version the entered values were based on; submitting never silently adopts a newer one.
  const [baseVersion, setBaseVersion] = useState(exam.version);
  const newerAvailable = exam.version !== baseVersion;
  const opened = exam.opensAt !== null && Date.parse(exam.serverNow) >= Date.parse(exam.opensAt);
  const started = exam.workStartedAt !== null;

  const opensAt = academyInstant(values.opensDate, values.opensTime);
  const closesAt = academyInstant(values.closesDate, values.closesTime);
  const invalid = !opensAt || !closesAt || Date.parse(opensAt) >= Date.parse(closesAt);
  const entered = values.opensDate && values.opensTime && values.closesDate && values.closesTime;
  const timeProblem = entered && (!opensAt || !closesAt)
    ? "That date or time doesn’t exist in academy time (a real calendar day is needed, and the hour skipped when daylight saving starts is not valid)."
    : null;

  function reload() {
    setValues({ opensDate: opens?.date ?? "", opensTime: opens?.time ?? "", closesDate: closes?.date ?? "", closesTime: closes?.time ?? "" });
    setBaseVersion(exam.version);
    setError(null);
  }

  async function submit(clear: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await setExamAvailability({
        academyId: exam.academyId, examId: exam.id, expectedVersion: baseVersion,
        opensAt: clear ? null : opensAt, closesAt: clear ? null : closesAt,
      });
      if (!isCurrentAcademy(exam.academyId)) return;
      if (!result.ok) { setError(result.message); return; }
      toast.success(clear ? "Online window removed." : "Online window saved.");
      void queryClient.invalidateQueries({ queryKey: examsRootKey(exam.academyId) });
      setOpen(false);
    } catch {
      if (isCurrentAcademy(exam.academyId)) setError("The connection dropped, so we couldn’t confirm whether this was saved. Reload to see the current state before trying again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); setError(null); }}>
      <DialogTrigger asChild><Button variant="outline"><IconCalendarClock />{exam.opensAt ? "Window" : "Set window"}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Online window</DialogTitle>
          <DialogDescription>
            Students can start between opening and the scheduled close. Attempts already started may finish until actual closure, two minutes later. Times are in academy time ({ACADEMY_TIME_ZONE}).
          </DialogDescription>
        </DialogHeader>
        {newerAvailable && (
          <Alert>
            <IconAlertCircle />
            <AlertTitle>The window changed elsewhere</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              Your entries are kept and will be checked against the version you started from.
              <Button variant="outline" size="sm" onClick={reload}>Discard mine and reload</Button>
            </AlertDescription>
          </Alert>
        )}
        {timeProblem && <Alert variant="destructive"><IconAlertCircle /><AlertTitle>Check the time</AlertTitle><AlertDescription>{timeProblem}</AlertDescription></Alert>}
        {error && <Alert variant="destructive"><IconAlertCircle /><AlertTitle>Not saved</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="exam-opens-date">Opens</FieldLabel>
            <div className="flex gap-2">
              <Input id="exam-opens-date" type="date" value={values.opensDate} disabled={opened} aria-label="Opening date"
                onChange={(event) => setValues({ ...values, opensDate: event.target.value })} />
              <Input type="time" value={values.opensTime} disabled={opened} aria-label="Opening time" className="w-32"
                onChange={(event) => setValues({ ...values, opensTime: event.target.value })} />
            </div>
            {opened && <FieldDescription>The exam has opened, so its opening time is fixed.</FieldDescription>}
          </Field>
          <Field>
            <FieldLabel htmlFor="exam-closes-date">Scheduled close</FieldLabel>
            <div className="flex gap-2">
              <Input id="exam-closes-date" type="date" value={values.closesDate} aria-label="Closing date"
                onChange={(event) => setValues({ ...values, closesDate: event.target.value })} />
              <Input type="time" value={values.closesTime} aria-label="Closing time" className="w-32"
                onChange={(event) => setValues({ ...values, closesTime: event.target.value })} />
            </div>
            <FieldDescription>
              {closesAt ? `Actual closure: ${formatAcademyDateTime(new Date(Date.parse(closesAt) + ACTUAL_CLOSE_MS).toISOString())}. ` : ""}
              {started ? "Students have started, so the close can only move later. " : ""}
              After actual closure the exam can’t reopen; a later sitting needs a new exam.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter className="gap-2">
          {exam.opensAt && !opened && !started && (
            <Button variant="ghost" className="sm:mr-auto" disabled={busy} onClick={() => void submit(true)}>Remove window</Button>
          )}
          <Button disabled={busy || invalid} onClick={() => void submit(false)}>{busy && <IconLoader2 className="animate-spin" />}Save window</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
