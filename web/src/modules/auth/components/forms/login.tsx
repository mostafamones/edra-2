"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { FcGoogle } from "react-icons/fc";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PhoneInput, TextInput } from "@/components/shared/app-input";
import { signIn } from "@/modules/auth/client";
import { useAuthDraft } from "@/modules/auth/components/draft-provider";
import { getAuthErrorMessage } from "@/modules/auth/errors";
import { signInSchema } from "@/modules/auth/validation";

import { AuthCardHeading } from "../card-heading";
import { AuthFormMessage } from "../form-message";
import { AuthSubmitButton } from "../submit-button";

type SignInFields = z.input<typeof signInSchema>;

export function LoginForm({ nextPath = "/app", passwordReset = false }: { nextPath?: string; passwordReset?: boolean }) {
  const router = useRouter();
  const authDraft = useAuthDraft();
  const draft = authDraft.readDraft();
  const form = useForm<SignInFields>({
    resolver: zodResolver(signInSchema),
    defaultValues: { phone: draft.phone, password: draft.password },
  });
  const [formError, setFormError] = useState<string | null>(null);
  const phoneField = form.register("phone");
  const passwordField = form.register("password");

  async function onSubmit(values: SignInFields) {
    setFormError(null);
    const parsed = signInSchema.parse(values);
    const { error } = await signIn(parsed);
    if (error) {
      setFormError(getAuthErrorMessage(error));
      return;
    }
    authDraft.clearDraft();
    router.replace(nextPath);
    router.refresh();
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <AuthCardHeading title="Welcome back" />
      {passwordReset && (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">Your password was changed. Sign in again.</p>
      )}

      <div className="space-y-4">
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="block w-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <Button type="button" variant="outline" className="h-10 w-full gap-2" disabled>
                <FcGoogle aria-hidden="true" size={18} />
                Login with Google
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>Not available at the moment</TooltipContent>
        </Tooltip>
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or continue with</span>
          <Separator className="flex-1" />
        </div>
      </div>

      <div className="space-y-4">
        <PhoneInput
          label="Mobile number"
          placeholder="100 123 4567"
          autoFocus
          required
          error={form.formState.errors.phone?.message}
          {...phoneField}
          onChange={(event) => {
            void phoneField.onChange(event);
            authDraft.updateDraft({ phone: event.currentTarget.value });
          }}
        />
        <div className="gap-1.5">
          <TextInput
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            error={form.formState.errors.password?.message}
            {...passwordField}
            onChange={(event) => {
              void passwordField.onChange(event);
              authDraft.updateDraft({ password: event.currentTarget.value });
            }}
          />
          <div className="text-right">
            <Link
              className="text-sm font-medium text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              href="/auth/forgot-password"
              onClick={() => authDraft.updateDraft({ password: "" })}
            >
              Forgot password?
            </Link>
          </div>
        </div>
      </div>
      <AuthFormMessage message={formError} />
      <AuthSubmitButton pending={form.formState.isSubmitting}>Sign in</AuthSubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        New to Edra?{" "}
        <Link
          className="font-medium text-foreground underline-offset-4 hover:underline"
          href={`/auth/signup?next=${encodeURIComponent(nextPath)}`}
          onClick={() =>
            authDraft.updateDraft({
              phone: form.getValues("phone"),
              password: form.getValues("password"),
            })
          }
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
