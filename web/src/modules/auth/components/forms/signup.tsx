"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { IconBrandGoogle } from "@tabler/icons-react";
import { IconInfoCircle } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PhoneInput, TextInput } from "@/components/shared/app-input";
import { signUp } from "@/modules/auth/client";
import { useAuthDraft } from "@/modules/auth/components/draft-provider";
import { getAuthErrorMessage } from "@/modules/auth/errors";
import { savePendingAuthFlow } from "@/modules/auth/pending-flow";
import { signUpSchema } from "@/modules/auth/validation";

import { AuthCardHeading } from "../card-heading";
import { AuthFormMessage } from "../form-message";
import { AuthSubmitButton } from "../submit-button";

type SignUpFields = z.input<typeof signUpSchema>;
type SignUpOutput = z.output<typeof signUpSchema>;

export function SignupForm({ nextPath = "/" }: { nextPath?: string }) {
  const router = useRouter();
  const authDraft = useAuthDraft();
  const draft = authDraft.readDraft();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignUpFields, unknown, SignUpOutput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { firstName: "", lastName: "", phone: draft.phone, password: draft.password },
  });
  const phoneField = form.register("phone");
  const passwordField = form.register("password");

  async function onSubmit(values: SignUpOutput) {
    setFormError(null);
    const { error } = await signUp(values);
    if (error) {
      setFormError(getAuthErrorMessage(error));
      return;
    }
    savePendingAuthFlow({ kind: "signup", phone: values.phone, nextPath });
    // Kept in memory only, so verification can finish with a password session.
    authDraft.updateDraft({ phone: values.phone, password: values.password });
    router.push("/auth/verify?mode=signup");
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <AuthCardHeading title="Create your account" />
      <AuthFormMessage message={formError} />

      <div className="space-y-4">
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="block w-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <Button type="button" variant="outline" className="h-10 w-full gap-2" disabled>
                <IconBrandGoogle aria-hidden="true" size={18} />
                Sign up with Google
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
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="First name" autoComplete="given-name" autoFocus required error={form.formState.errors.firstName?.message} {...form.register("firstName")} />
          <TextInput label="Last name" autoComplete="family-name" required error={form.formState.errors.lastName?.message} {...form.register("lastName")} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="signup-phone">Mobile number</Label>
            <Tooltip delayDuration={400}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Phone number verification information"
                  className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <IconInfoCircle size={16} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                You will be asked to verify this phone number through Whatsapp
              </TooltipContent>
            </Tooltip>
          </div>
          <PhoneInput
            id="signup-phone"
            placeholder="100 123 4567"
            required
            error={form.formState.errors.phone?.message}
            {...phoneField}
            onChange={(event) => {
              void phoneField.onChange(event);
              authDraft.updateDraft({ phone: event.currentTarget.value });
            }}
          />
        </div>
        <TextInput
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          error={form.formState.errors.password?.message}
          {...passwordField}
          onChange={(event) => {
            void passwordField.onChange(event);
            authDraft.updateDraft({ password: event.currentTarget.value });
          }}
        />
      </div>
      <AuthSubmitButton pending={form.formState.isSubmitting}>Create account</AuthSubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          className="font-medium text-foreground underline-offset-4 hover:underline"
          href={`/auth/login?next=${encodeURIComponent(nextPath)}`}
          onClick={() =>
            authDraft.updateDraft({
              phone: form.getValues("phone"),
              password: form.getValues("password"),
            })
          }
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
