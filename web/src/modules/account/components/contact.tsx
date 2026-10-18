"use client";

import { useEffect, useState } from "react";
import { IconLoader2 } from "@tabler/icons-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { toast } from "sonner";

import { PhoneInput } from "@/components/shared/app-input";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { normalizeEgyptianPhone } from "@/lib/phone";

import {
  cancelContactChange,
  completeContactChange,
  contactErrorMessage,
  displayPhone,
  endsContactChange,
  OLD_NUMBER_UNREACHABLE,
  resendContactCode,
  startContactChange,
  verifyContactCode,
  type ContactOperation,
  type ContactPurpose,
} from "../contact";

type Props = {
  purpose: ContactPurpose;
  label: string;
  /** The verified contact; it stays displayed until the replacement is committed. */
  current: string;
  /** This session's unfinished operation, recovered after a reload. */
  resumed: ContactOperation | null;
  onChanged: () => Promise<void> | void;
};

type Step = { kind: "idle" } | { kind: "entry" } | { kind: "operation"; operation: ContactOperation };

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** Replaces a verified phone after codes to the current and the new number. */
export function ContactChange({ purpose, label, current, resumed, onChanged }: Props) {
  const [step, setStep] = useState<Step>(() => (resumed ? { kind: "operation", operation: resumed } : { kind: "idle" }));
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const operation = step.kind === "operation" ? step.operation : null;
  const retryAt = operation?.retryAt ?? null;
  const now = useNow(Boolean(retryAt));
  const resendSeconds = retryAt ? Math.max(0, Math.ceil((Date.parse(retryAt) - now) / 1000)) : 0;
  const id = `${purpose}-code`;

  function restart(message: string | null) {
    setStep({ kind: "idle" });
    setPhone("");
    setCode("");
    setError(message);
  }

  function show(next: ContactOperation, message: string | null = null) {
    setCode("");
    setError(message);
    setStep({ kind: "operation", operation: next });
  }

  /** Terminal failures restart; a failed current-number step also states there is no bypass. */
  function fail(errorCode: string) {
    const message = contactErrorMessage(errorCode);
    const oldStep = operation?.stage === "old" && ["locked", "expired"].includes(errorCode);
    const full = oldStep ? `${message} ${OLD_NUMBER_UNREACHABLE}` : message;
    if (endsContactChange(errorCode)) restart(full);
    else setError(full);
  }

  async function finish() {
    await onChanged();
    restart(null);
    toast.success(`${label} changed.`);
  }

  async function run<T>(action: () => Promise<{ ok: true; value: T } | { ok: false; error: string }>, done: (value: T) => Promise<void> | void) {
    setBusy(true);
    setError(null);
    const result = await action();
    if (result.ok) await done(result.value);
    else fail(result.error);
    setBusy(false);
  }

  function start() {
    const replacement = normalizeEgyptianPhone(phone);
    if (!replacement) return setError(contactErrorMessage("invalid_phone"));
    if (replacement === current) return setError(contactErrorMessage("same_phone"));
    return run(() => startContactChange(purpose, replacement), ({ operation: next }) => show(next));
  }

  function verify(target: ContactOperation) {
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code");
    return run(() => verifyContactCode(target.id, code), async (value) => {
      if ("completed" in value) return finish();
      show(value.operation, value.sendError ? contactErrorMessage(value.sendError) : null);
    });
  }

  function cancel() {
    if (operation) void cancelContactChange(operation.id);
    restart(null);
  }

  if (step.kind === "idle") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{label}</span>
            <span dir="ltr" className="text-start text-sm tabular-nums text-muted-foreground">{displayPhone(current)}</span>
          </div>
          <Button variant="outline" onClick={() => { setError(null); setStep({ kind: "entry" }); }}>Change</Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  if (step.kind === "entry") {
    return (
      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void start(); }} noValidate>
        <PhoneInput label={`New ${label.toLowerCase()}`} id={`${purpose}-new`} value={phone} autoFocus
          onChange={(event) => setPhone(event.target.value)} disabled={busy} error={error ?? undefined} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !phone.trim()}>
            {busy && <IconLoader2 className="animate-spin" aria-hidden="true" />}
            Send code
          </Button>
          <Button type="button" variant="ghost" onClick={() => restart(null)} disabled={busy}>Cancel</Button>
        </div>
      </form>
    );
  }

  const target = step.operation;

  if (target.stage === "verified") {
    // Both numbers are proven; only the commit remains (for example after a lost response).
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">Both numbers verified. New number: <span dir="ltr" className="tabular-nums">{displayPhone(target.newPhone)}</span></p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run(() => completeContactChange(target.id), finish)} disabled={busy}>
            {busy && <IconLoader2 className="animate-spin" aria-hidden="true" />}
            Save new number
          </Button>
          <Button variant="ghost" onClick={cancel} disabled={busy}>Cancel</Button>
        </div>
      </div>
    );
  }

  const which = target.stage === "old" ? "current" : "new";
  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void verify(target); }} noValidate>
      <p className="text-sm font-medium">{target.stage === "old" ? "Step 1 of 2: current number" : "Step 2 of 2: new number"}</p>
      {target.codeSent ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={id}>Code sent to your {which} number •••• {target.recipientLast4}</Label>
          <InputOTP id={id} maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={code} onChange={setCode} autoFocus
            autoComplete="one-time-code" aria-invalid={Boolean(error)} disabled={busy}>
            <InputOTPGroup>
              {Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}
            </InputOTPGroup>
          </InputOTP>
        </div>
      ) : null}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {target.codeSent && (
          <Button type="submit" disabled={busy || code.length !== 6}>
            {busy && <IconLoader2 className="animate-spin" aria-hidden="true" />}
            Verify
          </Button>
        )}
        <Button type="button" variant={target.codeSent ? "outline" : "default"} disabled={busy || resendSeconds > 0}
          onClick={() => run(() => resendContactCode(target.id), ({ operation: next }) => show(next))}>
          {target.codeSent ? "Resend code" : "Send code"}{resendSeconds > 0 ? ` (${resendSeconds}s)` : ""}
        </Button>
        <Button type="button" variant="ghost" onClick={cancel} disabled={busy}>Cancel</Button>
      </div>
    </form>
  );
}
