"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { IconAlertCircle } from "@tabler/icons-react";
import { toast } from "sonner";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { newUuid } from "@/lib/uuid";
import { useAcademyScope } from "@/modules/auth";
import { recordCheckIn } from "../actions";
import { attendanceQueryKey } from "../queries";
import type { CheckInResult, SheetEntry } from "../types";
import { STATUS_LABELS } from "./labels";

const MAX_LATE_AFTER = 1440;
const storageKey = (sessionId: string) => `edra:attendance:late-after:${sessionId}`;

function readLateAfter(sessionId: string) {
  try {
    const stored = Number(window.localStorage.getItem(storageKey(sessionId)));
    return Number.isInteger(stored) && stored > 0 && stored <= MAX_LATE_AFTER ? String(stored) : "0";
  } catch { return "0"; }
}

/**
 * One check-in exactly as first sent. Kept unchanged until the server acknowledges it or staff abandon
 * it, so a retry after an uncertain outcome resends the same body and idempotency key.
 */
type PendingCheckIn = {
  academyId: string;
  sessionId: string;
  annualStudentRecordId: string;
  fullName: string;
  lateAfterMinutes: number;
  idempotencyKey: string;
  message: string;
};

const RETRYABLE = new Set(["unavailable", "throttled"]);

/**
 * Pick a student from the list (or type a name and press Enter) to check them in, then the next one. The late deadline is
 * kept on this device per session and sent with each check-in; the server decides who is late.
 */
export function CheckIn({ academyId, sessionId, entries, showCodes }: { academyId: string; sessionId: string; entries: SheetEntry[]; showCodes: boolean }) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [typed, setTyped] = useState("");
  // Students already marked Present or Late are done; only the rest can still be checked in.
  const pending = useMemo(() => entries.filter((entry) => entry.status !== "present" && entry.status !== "late"), [entries]);
  const [lateAfter, setLateAfter] = useState(() => readLateAfter(sessionId));
  const [uncertain, setUncertain] = useState<PendingCheckIn | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  // Throttled: Retry waits for the server's Retry-After.
  const [waiting, setWaiting] = useState(false);
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A command belongs to the academy and session it was made in.
  const command = uncertain && uncertain.academyId === academyId && uncertain.sessionId === sessionId ? uncertain : null;

  useEffect(() => () => { if (waitTimer.current) clearTimeout(waitTimer.current); }, []);

  function changeLateAfter(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    const next = digits === "" ? "" : String(Math.min(Number(digits), MAX_LATE_AFTER));
    setLateAfter(next);
    try { window.localStorage.setItem(storageKey(sessionId), next || "0"); } catch { /* the deadline just is not remembered */ }
  }

  async function send(attempt: Omit<PendingCheckIn, "message">) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    let result: CheckInResult;
    try {
      result = await recordCheckIn({
        academyId: attempt.academyId, sessionId: attempt.sessionId, annualStudentRecordId: attempt.annualStudentRecordId,
        idempotencyKey: attempt.idempotencyKey, lateAfterMinutes: attempt.lateAfterMinutes,
      });
    } catch {
      result = { ok: false, code: "unavailable", message: `Could not check in ${attempt.fullName}. Check your connection and try again.` };
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
    void queryClient.invalidateQueries({ queryKey: attendanceQueryKey(attempt.academyId, attempt.sessionId) });
    if (!isCurrentAcademy(attempt.academyId)) return;
    if (!result.ok && RETRYABLE.has(result.code)) {
      // The outcome is unknown or deferred: keep the exact command for Retry.
      setUncertain({ ...attempt, message: result.message });
      if (result.retryAfter) {
        setWaiting(true);
        if (waitTimer.current) clearTimeout(waitTimer.current);
        waitTimer.current = setTimeout(() => setWaiting(false), result.retryAfter * 1000);
      }
      return;
    }
    setUncertain(null);
    if (!result.ok) { toast.error(result.message); return; }
    const status = STATUS_LABELS[result.entry.status].toLowerCase();
    if (result.outcome === "recorded") toast.success(`${attempt.fullName} checked in${result.entry.status === "late" ? " late" : ""}.`);
    else if (result.outcome === "already_recorded") toast.info(`${attempt.fullName} is already marked ${status}.`);
    else toast.warning(`${attempt.fullName} is marked ${status}. Change it in the table if they arrived.`);
  }

  function checkIn(student: SheetEntry) {
    setTyped("");
    if (command || inFlight.current) return;
    // Late-after is captured now and never re-read from the field on Retry.
    void send({
      academyId, sessionId, annualStudentRecordId: student.annualStudentRecordId, fullName: student.fullName,
      lateAfterMinutes: Number(lateAfter) || 0, idempotencyKey: newUuid(),
    });
  }

  return (
    <div className="flex flex-col gap-2">
    {command && (
      <Alert variant="destructive">
        <IconAlertCircle />
        <AlertTitle>{command.fullName} may not be checked in</AlertTitle>
        <AlertDescription>{command.message}</AlertDescription>
        <AlertAction className="flex gap-1.5">
          <Button size="sm" variant="outline" disabled={busy || waiting} onClick={() => void send(command)}>
            {busy ? "Retrying…" : "Retry"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setUncertain(null)}>Dismiss</Button>
        </AlertAction>
      </Alert>
    )}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Combobox
        items={pending}
        value={null}
        inputValue={typed}
        onInputValueChange={setTyped}
        onValueChange={(student: SheetEntry | null) => { if (student) void checkIn(student); }}
        itemToStringLabel={(student: SheetEntry) => student.fullName}
        filter={(student: SheetEntry, query: string) => {
          const needle = query.trim().toLowerCase();
          return student.fullName.toLowerCase().includes(needle) || (showCodes && (student.studentCode?.toLowerCase().includes(needle) ?? false));
        }}
        isItemEqualToValue={(a: SheetEntry, b: SheetEntry) => a.annualStudentRecordId === b.annualStudentRecordId}
        autoHighlight
      >
        <ComboboxInput placeholder="Check in a student" aria-label={showCodes ? "Check in a student by name or code" : "Check in a student by name"} autoComplete="off" showTrigger={false} className="w-sm" disabled={busy || command !== null} />
        <ComboboxContent>
          <ComboboxEmpty>No student matches.</ComboboxEmpty>
          <ComboboxList>
            {(student: SheetEntry) => (
              <ComboboxItem key={student.annualStudentRecordId} value={student} className={"px-3"}>
                <div className="flex flex-row w-full items-center justify-between">
                  <div className="flex flex-col">
                    <span className="">{student.fullName}</span>
                    {showCodes && student.studentCode && <span className="font-mono text-xs text-muted-foreground">{student.studentCode}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{STATUS_LABELS[student.status]}</p>
                </div>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <InputGroup className="w-auto" title="Check-ins later than this after the session started are marked Late. 0 never marks Late.">
        <InputGroupAddon><InputGroupText>Late after</InputGroupText></InputGroupAddon>
        <InputGroupInput
          value={lateAfter}
          onChange={(event) => changeLateAfter(event.target.value)}
          onFocus={(event) => event.target.select()}
          inputMode="numeric"
          aria-label="Minutes after the session start before a check-in is Late (0 for never)"
          className="w-12 text-center tabular-nums"
        />
        <InputGroupAddon align="inline-end"><InputGroupText>min</InputGroupText></InputGroupAddon>
      </InputGroup>
    </div>
    </div>
  );
}
