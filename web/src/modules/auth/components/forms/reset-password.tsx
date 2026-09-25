"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { TextInput } from "@/components/shared/app-input";
import { signOutEverywhere, updateRecoveredPassword } from "@/modules/auth/client";
import { getAuthErrorMessage } from "@/modules/auth/errors";
import { clearPendingAuthFlow, readPendingAuthFlow } from "@/modules/auth/pending-flow";
import { resetPasswordSchema } from "@/modules/auth/validation";

import { AuthCardHeading } from "../card-heading";
import { AuthFormMessage } from "../form-message";
import { AuthSubmitButton } from "../submit-button";

type ResetPasswordFields = z.input<typeof resetPasswordSchema>;

export function ResetPasswordForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ResetPasswordFields>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit(values: ResetPasswordFields) {
    setFormError(null);
    if (!readPendingAuthFlow("recovery")) {
      setFormError("Start password recovery again before choosing a new password.");
      return;
    }
    const parsed = resetPasswordSchema.parse(values);
    const { error } = await updateRecoveredPassword(parsed);
    if (error) {
      setFormError(getAuthErrorMessage(error));
      return;
    }
    await fetch("/auth/recovery-session", { method: "DELETE" });
    const { error: signOutError } = await signOutEverywhere();
    if (signOutError) {
      setFormError(getAuthErrorMessage(signOutError));
      return;
    }
    clearPendingAuthFlow();
    router.replace("/auth/login?reset=1");
    router.refresh();
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <AuthCardHeading title="Choose a new password" description="Changing password will disconnect all devices connected to this account." />
      <AuthFormMessage message={formError} />
      <div className="space-y-4">
        <TextInput label="New password" type="password" autoComplete="new-password" autoFocus required error={form.formState.errors.password?.message} {...form.register("password")} />
        <TextInput label="Confirm new password" type="password" autoComplete="new-password" required error={form.formState.errors.confirmPassword?.message} {...form.register("confirmPassword")} />
      </div>
      <AuthSubmitButton pending={form.formState.isSubmitting}>Update password</AuthSubmitButton>
    </form>
  );
}
