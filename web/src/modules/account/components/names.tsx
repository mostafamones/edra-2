"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";

import { TextInput } from "@/components/shared/app-input";
import { Button } from "@/components/ui/button";

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
  return (
    <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <TextInput label="Full name" dir="auto" autoComplete="name" required error={form.formState.errors.fullName?.message} {...form.register("fullName")} />
      <TextInput label="Display name" dir="auto" autoComplete="nickname" error={form.formState.errors.displayName?.message} {...form.register("displayName")} />
      {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
      <Button type="submit" className="self-end" disabled={pending || !form.formState.isDirty}>
        {pending && <IconLoader2 className="animate-spin" aria-hidden="true" />}
        Save
      </Button>
    </form>
  );
}
