"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { IconAlertCircle, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";

import { PhoneInput, TextInput } from "@/components/shared/app-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { staffAcademyHref } from "@/lib/routing";
import { useAcademyScope, useAuth } from "@/modules/auth";

import { ACADEMY_ICONS } from "../../icons";
import { loadAcademyProfile, saveAcademyProfile, type AcademyProfileResult } from "../actions";
import { academyProfileSchema, sameProfileValues, type AcademyProfile, type AcademyProfileFields, type AcademyProfileInput } from "../validation";

type Notice = { kind: "error"; message: string } | { kind: "conflict"; current: AcademyProfile };

const MESSAGES = {
  invalid: "Check the highlighted fields.",
  sessionExpired: "Your session has ended. Sign in again.",
  forbidden: "You no longer have permission to edit this academy.",
  saveFailed: "Couldn’t save the academy profile. Try again.",
};

/** Contacts are stored as +201…; the phone input shows the national part after its +20 prefix. */
const national = (phone: string | null) => phone?.replace(/^\+20/, "") ?? "";
const toFields = (profile: AcademyProfile): AcademyProfileFields => ({
  name: profile.name, icon: profile.icon, subject: profile.subject, phone: national(profile.phone), whatsapp: national(profile.whatsapp),
});

export function AcademyProfileSettings({ profile }: { profile: AcademyProfile | null }) {
  const router = useRouter();
  return (
    <main className="page-shell min-w-0">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Academy profile</h1>
        {profile ? <ProfileForm profile={profile} /> : (
          <Alert variant="destructive">
            <IconAlertCircle aria-hidden="true" />
            <AlertDescription className="flex flex-wrap items-center gap-3">
              Couldn’t load the academy profile.
              <Button size="sm" variant="outline" onClick={() => router.refresh()}>Try again</Button>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </main>
  );
}

function ProfileForm({ profile }: { profile: AcademyProfile }) {
  const router = useRouter();
  const { refreshAcademies } = useAuth();
  const isCurrentAcademy = useAcademyScope();
  // Server refreshes re-render this page with new props; the draft and baseline only change on deliberate actions.
  const [baseline, setBaseline] = useState(profile.updatedAt);
  const [notice, setNotice] = useState<Notice | null>(null);
  const form = useForm<AcademyProfileFields, unknown, AcademyProfileInput>({
    resolver: zodResolver(academyProfileSchema),
    defaultValues: toFields(profile),
  });

  function adopt(saved: AcademyProfile) {
    form.reset(toFields(saved));
    setBaseline(saved.updatedAt);
    setNotice(null);
  }

  async function onSubmit(values: AcademyProfileInput) {
    const academyId = profile.id;
    setNotice(null);
    let result: AcademyProfileResult;
    try {
      result = await saveAcademyProfile(profile.slug, baseline, values);
    } catch {
      // The save may have committed before the response was lost: trust only the persisted state.
      const current = await loadAcademyProfile(profile.slug).catch(() => null);
      result = current && sameProfileValues(current, values) ? { ok: true, profile: current } : { ok: false, code: "saveFailed" };
      if (result.ok) router.refresh();
    }
    if (!isCurrentAcademy(academyId)) return;

    if (result.ok) {
      adopt(result.profile);
      toast.success("Academy profile saved");
      // The header and switcher read memberships too; a failed refresh does not undo the save.
      void refreshAcademies().catch(() => undefined);
      return;
    }
    if (result.code === "conflict") return setNotice({ kind: "conflict", current: result.current });
    if (result.code === "invalid") {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        if (message) form.setError(field as keyof AcademyProfileFields, { message });
      }
    }
    setNotice({ kind: "error", message: MESSAGES[result.code] });
  }

  const { errors, isSubmitting, isDirty } = form.formState;
  const readOnly = !profile.canEdit;
  return (
    <Card>
      <CardContent>
        <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <fieldset disabled={readOnly || isSubmitting} className="flex min-w-0 flex-col gap-6">
            <TextInput label="Name" dir="auto" autoComplete="organization" required maxLength={100} error={errors.name?.message} {...form.register("name")} />
            <Controller control={form.control} name="icon" render={({ field }) => (
              <Field data-invalid={Boolean(errors.icon) || undefined}>
                <FieldLabel htmlFor="academy-icon">Icon</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="academy-icon" className="w-full" aria-invalid={Boolean(errors.icon) || undefined}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACADEMY_ICONS).map(([id, { label, Icon }]) => (
                      <SelectItem key={id} value={id}><Icon aria-hidden="true" />{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError>{errors.icon?.message}</FieldError>
              </Field>
            )} />
            <TextInput label="Subject" dir="auto" required maxLength={60} error={errors.subject?.message} {...form.register("subject")} />
            <PhoneInput label="Phone" error={errors.phone?.message} {...form.register("phone")} />
            <PhoneInput label="WhatsApp" autoComplete="off" error={errors.whatsapp?.message} {...form.register("whatsapp")} />
          </fieldset>
          <TextInput label="Academy link" value={staffAcademyHref(profile.slug)} readOnly />

          {notice?.kind === "error" && <p role="alert" className="text-sm text-destructive">{notice.message}</p>}
          {notice?.kind === "conflict" && (
            <Alert>
              <IconAlertCircle aria-hidden="true" />
              <AlertDescription className="flex flex-col gap-3">
                Someone else changed this profile. Your edits haven’t been saved.
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => adopt(notice.current)}>Load latest</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => { setBaseline(notice.current.updatedAt); setNotice(null); }}>Keep my edits</Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          {!readOnly && (
            <Button type="submit" className="self-end" disabled={isSubmitting || !isDirty || notice?.kind === "conflict"}>
              {isSubmitting && <IconLoader2 className="animate-spin" aria-hidden="true" />}
              Save
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
