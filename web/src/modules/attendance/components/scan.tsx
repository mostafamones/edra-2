"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { IconBarcode } from "@tabler/icons-react";
import { toast } from "sonner";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { newUuid } from "@/lib/uuid";
import { useAcademyScope } from "@/modules/auth";
import { normalizeStudentCode } from "@/modules/students/contract";
import { recordCheckIn } from "../actions";
import { attendanceQueryKey } from "../queries";
import { STATUS_LABELS } from "./labels";

/** One immutable attempt: its key is reused until the server gives a definitive answer. */
type Payload = { code: string; lateAfterMinutes: number; key: string };

/**
 * Exact-code entry for scanners and typing: type a full code and press Enter. The code goes to the
 * server as is, and the database resolves it; this field never picks a student from the local list.
 * Results come only from the server's acknowledgment. After a network failure the same code is
 * retried with the same Idempotency-Key. Mount it with a key that includes academy and session so an
 * old pending attempt can never reach another context.
 */
export function CodeScan({ academyId, sessionId, lateAfterMinutes }: { academyId: string; sessionId: string; lateAfterMinutes: number }) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const pending = useRef<Payload | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function submit() {
    if (inFlight.current) return;
    const code = normalizeStudentCode(value);
    if (!code) {
      if (value.trim() !== "") setProblem("Use 1–20 letters, digits, or hyphens, with no spaces inside.");
      return;
    }
    // The uncertain attempt is retried unchanged; anything else starts a new one.
    const retry = pending.current;
    const payload = retry && retry.code === code && retry.lateAfterMinutes === lateAfterMinutes
      ? retry
      : { code, lateAfterMinutes, key: newUuid() };
    pending.current = payload;
    inFlight.current = true;
    setBusy(true);
    setProblem("");
    let definitive = true;
    try {
      const result = await recordCheckIn({
        academyId, sessionId, studentCode: payload.code, idempotencyKey: payload.key, lateAfterMinutes: payload.lateAfterMinutes,
      });
      void queryClient.invalidateQueries({ queryKey: attendanceQueryKey(academyId, sessionId) });
      if (!isCurrentAcademy(academyId)) return;
      if (!result.ok) {
        definitive = result.code !== "unavailable" && result.code !== "throttled";
        if (definitive) toast.error(result.message);
        else setProblem(`${result.message} Press Enter to try again.`);
        return;
      }
      const name = result.entry.fullName;
      const status = STATUS_LABELS[result.entry.status].toLowerCase();
      if (result.outcome === "recorded") toast.success(`${name} checked in${result.entry.status === "late" ? " late" : ""}.`);
      else if (result.outcome === "already_recorded") toast.info(`${name} is already marked ${status}.`);
      else toast.warning(`${name} is marked ${status}. Change it in the table if they arrived.`);
    } catch {
      definitive = false;
      setProblem("Could not reach the server. Press Enter to try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
      if (definitive) {
        pending.current = null;
        setValue("");
        input.current?.focus();
      }
    }
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="flex flex-col gap-1">
      <InputGroup className="w-48">
        <InputGroupAddon><IconBarcode aria-hidden="true" /></InputGroupAddon>
        <InputGroupInput
          ref={input}
          value={value}
          onChange={(event) => { setValue(event.target.value); setProblem(""); }}
          readOnly={busy}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="Scan or type a code"
          aria-label="Scan or type a full student code, then press Enter"
          aria-invalid={Boolean(problem)}
          className="font-mono"
        />
      </InputGroup>
      {problem && <p role="alert" className="text-xs text-destructive">{problem}</p>}
    </form>
  );
}
