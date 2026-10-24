"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { SettingsRow } from "@/components/shared/settings-row";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { saveProfile } from "../actions";
import { accountQueryKeys, type AccountProfile } from "../queries";
import { profileSchema, type ProfileFields, type ProfileInput } from "../validation";

export function ProfileNames({ userId, profile }: { userId: string; profile: AccountProfile }) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ProfileFields, unknown, ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: profile.fullName ?? "", displayName: profile.displayName ?? "" },
  });

  async function onSubmit(values: ProfileInput) {
    setFormError(null);
    const result = await saveProfile(values).catch(() => ({ ok: false as const, message: "Couldn’t save your profile. Try again.", fieldErrors: undefined }));
    if (!result.ok) {
      if (result.fieldErrors?.fullName) form.setError("fullName", { message: result.fieldErrors.fullName });
      if (result.fieldErrors?.displayName) form.setError("displayName", { message: result.fieldErrors.displayName });
      setFormError(result.message);
      return;
    }
    const saved = { fullName: result.fullName, displayName: result.displayName ?? "" };
    form.reset(saved);
    queryClient.setQueryData<AccountProfile>(accountQueryKeys.profile(userId), (previous) => previous && { ...previous, fullName: result.fullName, displayName: result.displayName });
    void queryClient.invalidateQueries({ queryKey: accountQueryKeys.profile(userId) });
    toast.success("Profile saved");
  }

  const pending = form.formState.isSubmitting;
  const { errors, isDirty } = form.formState;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      {/* The rows alone carry the dividers, so the pinned bar never adds a border under the last row. */}
      <div className="divide-y divide-border/60">
        <NameRow id="full-name" title="Full name" error={errors.fullName?.message}>
          <Input id="full-name" dir="auto" autoComplete="name" required className="h-8 w-48 sm:w-64" aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? "full-name-error" : undefined} {...form.register("fullName")} />
        </NameRow>
        <NameRow id="display-name" title="Display name" error={errors.displayName?.message}>
          <Input id="display-name" dir="auto" autoComplete="nickname" className="h-8 w-48 sm:w-64" aria-invalid={Boolean(errors.displayName)} aria-describedby={errors.displayName ? "display-name-error" : undefined} {...form.register("displayName")} />
        </NameRow>
      </div>
      {(isDirty || formError) && (
        // Pinned like the students bulk bar so the settings list never grows a row.
        <div role="region" aria-label="Unsaved changes" className="fixed bottom-6 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-lg border bg-popover p-1.5 text-sm shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {formError
            ? <span role="alert" className="px-2 text-destructive">{formError}</span>
            : <span className="px-2 font-medium">Unsaved changes</span>}
          <Separator orientation="vertical" className="mx-1 h-5! self-center!" />
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => { form.reset(); setFormError(null); }}>Cancel</Button>
          <Button type="submit" size="sm" disabled={pending || !isDirty}>
            {pending && <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}
            Save
          </Button>
        </div>
      )}
    </form>
  );
}

function NameRow({ id, title, error, children }: { id: string; title: string; error?: string; children: React.ReactNode }) {
  return (
    <SettingsRow id={id} title={title}>
      <div className="flex flex-col items-end gap-1">
        {children}
        {error && <span id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</span>}
      </div>
    </SettingsRow>
  );
}
