"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { REGEXP_ONLY_DIGITS } from "input-otp";

import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  requestPasswordRecovery,
  resendSignupCode,
  verifyRecoveryCode,
  verifySignup,
} from "@/modules/auth/client";
import { useAuthDraft } from "@/modules/auth/components/draft-provider";
import { getAuthErrorMessage } from "@/modules/auth/errors";
import { clearPendingAuthFlow, readPendingAuthFlow, savePendingAuthFlow, type PendingAuthKind } from "@/modules/auth/pending-flow";
import { verificationSchema } from "@/modules/auth/validation";
import { safeNextPath } from "@/modules/auth/return-path";

import { AuthCardHeading } from "../card-heading";
import { AuthFormMessage } from "../form-message";
import { AuthSubmitButton } from "../submit-button";

type CodeFields = Pick<z.input<typeof verificationSchema>, "code">;

const FLOW_COPY: Record<PendingAuthKind, { title: string; returnHref: string }> = {
  signup: {
    title: "Verify your number",
    returnHref: "/auth/signup",
  },
  recovery: {
    title: "Verify your identity",
    returnHref: "/auth/forgot-password",
  },
};

const subscribeToPendingFlow = () => () => {};

export function VerifyForm({ mode }: { mode: PendingAuthKind }) {
  const router = useRouter();
  const authDraft = useAuthDraft();
  const copy = FLOW_COPY[mode];
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const pendingPhone = useSyncExternalStore<string | null | undefined>(
    subscribeToPendingFlow,
    () => readPendingAuthFlow(mode)?.phone ?? null,
    () => undefined,
  );
  const flowLoaded = pendingPhone !== undefined;
  const form = useForm<CodeFields>({
    resolver: zodResolver(verificationSchema.pick({ code: true })),
    defaultValues: { code: "" },
  });

  useEffect(() => {
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function onSubmit(values: CodeFields) {
    setFormError(null);
    const result = verificationSchema.safeParse({ phone: pendingPhone, code: values.code });
    if (!result.success) {
      setFormError("Request a new verification code and try again.");
      return;
    }
    const parsed = result.data;

    if (mode === "recovery") {
      // The server verifies the code and keeps the recovery session in an httpOnly cookie.
      const { error } = await verifyRecoveryCode(parsed);
      if (error) {
        setFormError(error);
        return;
      }
      router.replace("/auth/reset-password");
      return;
    }

    const verification = await verifySignup(parsed, authDraft.readDraft().password || null);
    if (verification.error) {
      setFormError(getAuthErrorMessage(verification.error));
      return;
    }

    const nextPath = safeNextPath(readPendingAuthFlow("signup")?.nextPath);
    clearPendingAuthFlow();
    authDraft.updateDraft({ phone: parsed.phone, password: "" });
    if (!verification.signedIn) {
      // The number is verified; the password is no longer in memory (for example after a reload).
      router.replace(`/auth/login?verified=1&next=${encodeURIComponent(nextPath)}`);
      return;
    }
    authDraft.clearDraft();
    if (nextPath.startsWith("https://") || nextPath.startsWith("http://")) {
      window.location.assign(nextPath);
      return;
    }
    router.replace(nextPath);
    router.refresh();
  }

  async function resendCode() {
    if (isResending) return;
    const phoneResult = verificationSchema.shape.phone.safeParse(pendingPhone);
    if (!phoneResult.success) {
      setFormError("Request a new verification code and try again.");
      return;
    }

    setFormError(null);
    setNotice(null);
    setIsResending(true);
    try {
      const result = mode === "signup"
        ? await resendSignupCode(phoneResult.data)
        : await requestPasswordRecovery(phoneResult.data);

      if (result.error) {
        setFormError(getAuthErrorMessage(result.error));
        return;
      }

      // Keep the signup continuation (such as a staff invitation join screen) across resends.
      const nextPath = mode === "signup" ? readPendingAuthFlow("signup")?.nextPath : undefined;
      savePendingAuthFlow({ kind: mode, phone: phoneResult.data, nextPath });
      setCooldown(60);
      setNotice("A new code was requested. Check WhatsApp.");
    } finally {
      setIsResending(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <AuthCardHeading title={copy.title} />
      {pendingPhone && (
        <p className="text-center text-sm text-muted-foreground">
          Enter the 6-digit code sent to your number ending in <span className="font-medium text-foreground">***{pendingPhone.slice(-4)}</span> via Whatsapp.
        </p>
      )}
      <AuthFormMessage message={formError ?? (flowLoaded && !pendingPhone ? "No verification request found. Go back and request a new code." : null)} />
      {notice && <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">{notice}</p>}
      <Field className="gap-3">
        <div className="flex w-full items-center gap-2 sm:gap-3">
          <Controller
            control={form.control}
            name="code"
            render={({ field }) => (
              <InputOTP
                {...field}
                id="verification-code"
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                containerClassName="justify-start"
                aria-invalid={Boolean(form.formState.errors.code)}
                aria-describedby={form.formState.errors.code ? "verification-code-error" : undefined}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="size-8 text-sm sm:size-10 sm:text-base" />
                  <InputOTPSlot index={1} className="size-8 text-sm sm:size-10 sm:text-base" />
                  <InputOTPSlot index={2} className="size-8 text-sm sm:size-10 sm:text-base" />
                  <InputOTPSlot index={3} className="size-8 text-sm sm:size-10 sm:text-base" />
                  <InputOTPSlot index={4} className="size-8 text-sm sm:size-10 sm:text-base" />
                  <InputOTPSlot index={5} className="size-8 text-sm sm:size-10 sm:text-base" />
                </InputOTPGroup>
              </InputOTP>
            )}
          />
          <AuthSubmitButton
            pending={form.formState.isSubmitting}
            disabled={!pendingPhone}
            className="h-10 w-auto min-w-0 flex-1 px-2"
          >
            Verify
          </AuthSubmitButton>
        </div>
        <FieldError id="verification-code-error" errors={[form.formState.errors.code]} />
      </Field>
      <div className="flex items-center justify-between gap-4 text-sm">
        <Link className="font-medium underline-offset-4 hover:underline" href={copy.returnHref}>Go back</Link>
        <Button type="button" variant="link" className="h-auto p-0" disabled={isResending || cooldown > 0 || !pendingPhone} onClick={resendCode}>
          {isResending ? "Sending..." : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </Button>
      </div>
    </form>
  );
}
