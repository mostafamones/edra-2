"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { newUuid } from "@/lib/uuid";
import { useAcademyScope } from "@/modules/auth";
import { recordCheckIn } from "../actions";
import { attendanceQueryKey } from "../queries";
import type { SheetEntry } from "../types";
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

  function changeLateAfter(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    const next = digits === "" ? "" : String(Math.min(Number(digits), MAX_LATE_AFTER));
    setLateAfter(next);
    try { window.localStorage.setItem(storageKey(sessionId), next || "0"); } catch { /* the deadline just is not remembered */ }
  }

  async function checkIn(student: SheetEntry) {
    setTyped("");
    try {
      const result = await recordCheckIn({
        academyId, sessionId, annualStudentRecordId: student.annualStudentRecordId, idempotencyKey: newUuid(),
        lateAfterMinutes: Number(lateAfter) || 0,
      });
      void queryClient.invalidateQueries({ queryKey: attendanceQueryKey(academyId, sessionId) });
      if (!isCurrentAcademy(academyId)) return;
      if (!result.ok) { toast.error(result.message); return; }
      const status = STATUS_LABELS[result.entry.status].toLowerCase();
      if (result.outcome === "recorded") toast.success(`${student.fullName} checked in${result.entry.status === "late" ? " late" : ""}.`);
      else if (result.outcome === "already_recorded") toast.info(`${student.fullName} is already marked ${status}.`);
      else toast.warning(`${student.fullName} is marked ${status}. Change it in the table if they arrived.`);
    } catch {
      toast.error(`Could not check in ${student.fullName}. Check your connection and try again.`);
    }
  }

  return (
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
        <ComboboxInput placeholder="Check in a student" aria-label={showCodes ? "Check in a student by name or code" : "Check in a student by name"} autoComplete="off" showTrigger={false} className="w-sm" />
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
  );
}
