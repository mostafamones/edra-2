"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { toast } from "sonner";
import type { z } from "zod";

import { TextInput } from "@/components/shared/app-input";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { resetPasswordSchema } from "@/modules/auth";

import {
  cancelPasswordChange,
  completePasswordChange,
  endsPasswordChallenge,
  passwordErrorMessage,
  requestPasswordCode,
  verifyPasswordCode,
  type PasswordChallenge,
} from "../client";

type Step = { kind: "idle" } | { kind: "code"; challenge: PasswordChallenge } | { kind: "password"; challenge: PasswordChallenge };
type PasswordFields = z.input<typeof resetPasswordSchema>;

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export function PasswordChange() {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState<string | null>(null);
  const form = useForm<PasswordFields>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "", confirmPassword: "" } });
  const now = useNow(Boolean(retryAt));
  const resendSeconds = retryAt ? Math.max(0, Math.ceil((Date.parse(retryAt) - now) / 1000)) : 0;

  function restart(message: string | null) {
    setStep({ kind: "idle" });
    setCode("");
    form.reset();
    setError(message);
  }

  async function request() {
    setBusy(true);
    setError(null);
    const result = await requestPasswordCode();
    setBusy(false);
    if (!result.ok) {
      setRetryAt(result.retryAt ?? null);
      setError(passwordErrorMessage(result));
      return;
    }
    setRetryAt(result.value.challenge.retryAt);
    setCode("");
    setStep({ kind: "code", challenge: result.value.challenge });
  }

  async function verify(challenge: PasswordChallenge) {
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await verifyPasswordCode(challenge.id, code);
    setBusy(false);
    if (!result.ok) {
      if (endsPasswordChallenge(result.error)) restart(passwordErrorMessage(result));
      else setError(passwordErrorMessage(result));
      return;
    }
    setStep({ kind: "password", challenge });
  }

  async function complete(challenge: PasswordChallenge, values: PasswordFields) {
    setError(null);
    const result = await completePasswordChange(challenge.id, resetPasswordSchema.parse(values).password);
    if (!result.ok) {
      if (endsPasswordChallenge(result.error)) restart(passwordErrorMessage(result));
      else setError(passwordErrorMessage(result));
      return;
    }
    restart(null);
    toast.success("Password changed. Other devices were signed out.");
  }

  async function cancel() {
    if (step.kind !== "idle") void cancelPasswordChange(step.challenge.id);
    restart(null);
  }

  if (step.kind === "idle") {
    return (
      <div className="flex flex-col gap-2 px-6 py-5">
        <div className="flex items-center justify-between gap-6">
          <span className="text-sm font-medium">Password</span>
          <Button variant="outline" size="sm" onClick={request} disabled={busy || resendSeconds > 0}>
            {busy && <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}
            {resendSeconds > 0 ? `Change password (${resendSeconds}s)` : "Change password"}
          </Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  if (step.kind === "code") {
    const { challenge } = step;
    return (
      <form className="flex flex-col gap-4 px-6 py-5" onSubmit={(event) => { event.preventDefault(); void verify(challenge); }} noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password-code">Code sent to •••• {challenge.phoneLast4}</Label>
          <InputOTP id="password-code" maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={code} onChange={setCode} autoFocus
            autoComplete="one-time-code" aria-invalid={Boolean(error)} disabled={busy}>
            <InputOTPGroup>
              {Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}
            </InputOTPGroup>
          </InputOTP>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={busy || code.length !== 6}>
            {busy && <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}
            Verify
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={request} disabled={busy || resendSeconds > 0}>
            {resendSeconds > 0 ? `Resend code (${resendSeconds}s)` : "Resend code"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={busy}>Cancel</Button>
        </div>
      </form>
    );
  }

  const { challenge } = step;
  const pending = form.formState.isSubmitting;
  return (
    <form className="flex flex-col gap-4 px-6 py-5" onSubmit={form.handleSubmit((values) => complete(challenge, values))} noValidate>
      <TextInput containerClassName="max-w-sm" label="New password" type="password" autoComplete="new-password" autoFocus required error={form.formState.errors.password?.message} {...form.register("password")} />
      <TextInput containerClassName="max-w-sm" label="Confirm new password" type="password" autoComplete="new-password" required error={form.formState.errors.confirmPassword?.message} {...form.register("confirmPassword")} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}
          Update password
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={pending}>Cancel</Button>
      </div>
    </form>
  );
}
