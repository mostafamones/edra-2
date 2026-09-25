"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { PhoneInput } from "@/components/shared/app-input";
import { requestPasswordRecovery } from "@/modules/auth/client";
import { getAuthErrorMessage } from "@/modules/auth/errors";
import { savePendingAuthFlow } from "@/modules/auth/pending-flow";
import { forgotPasswordSchema } from "@/modules/auth/validation";

import { AuthCardHeading } from "../card-heading";
import { AuthFormMessage } from "../form-message";
import { AuthSubmitButton } from "../submit-button";

type ForgotPasswordFields = z.input<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ForgotPasswordFields>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { phone: "" } });

  async function onSubmit(values: ForgotPasswordFields) {
    setFormError(null);
    const parsed = forgotPasswordSchema.parse(values);
    const { error } = await requestPasswordRecovery(parsed.phone);
    if (error) {
      setFormError(getAuthErrorMessage(error));
      return;
    }
    savePendingAuthFlow({ kind: "recovery", phone: parsed.phone });
    router.push("/auth/verify?mode=recovery");
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <AuthCardHeading title="Reset your password" description="We’ll send a recovery code to your number." />
      <AuthFormMessage message={formError} />
      <PhoneInput label="Mobile number" placeholder="100 123 4567" autoFocus required error={form.formState.errors.phone?.message} {...form.register("phone")} />
      <AuthSubmitButton pending={form.formState.isSubmitting}>Send recovery code</AuthSubmitButton>
      <div className="space-y-2 text-center text-sm">
        <Link className="font-medium underline-offset-4 hover:underline" href="/auth/login">Back to sign in</Link>
        <p className="text-muted-foreground">
          Lost access to this number? Contact Edra support for a manual account review.
        </p>
      </div>
    </form>
  );
}
