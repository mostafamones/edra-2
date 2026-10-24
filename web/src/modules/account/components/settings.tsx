"use client";

import { useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";

import { SettingsGroup } from "@/components/shared/settings-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/modules/auth";

import { accountQueryKeys, useAccountContacts, useAccountProfile } from "../queries";
import { ContactChange } from "./contact";
import { AccountDeletion } from "./delete";
import { ProfileNames } from "./names";
import { PasswordChange } from "./password";
import { ProfilePicture } from "./picture";

/** Personal account settings, shared by the staff `/account` and student `/profile` pages. */
export function AccountSettings() {
  const { user } = useAuth();
  const { profile, name, avatarUrl, isLoading, error, refetch } = useAccountProfile();
  const contacts = useAccountContacts();
  const queryClient = useQueryClient();
  const resumed = (purpose: string) => contacts.data?.operations.find((operation) => operation.purpose === purpose) ?? null;

  async function contactChanged(loginPhone: boolean) {
    // A new login phone reaches the session's user (header, menus) only through a refreshed token.
    if (loginPhone) await createClient().auth.refreshSession();
    await queryClient.invalidateQueries({ queryKey: [...accountQueryKeys.all, "contacts"] });
  }

  return (
    <main className="page-shell min-w-0">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        {error ? (
          <Alert variant="destructive">
            <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} aria-hidden="true" />
            <AlertDescription className="flex flex-wrap items-center gap-3">
              Couldn’t load your profile.
              <Button size="sm" variant="outline" onClick={() => void refetch()}>Try again</Button>
            </AlertDescription>
          </Alert>
        ) : !user || isLoading || !profile ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : (
          <SettingsGroup title="Profile">
            <ProfilePicture userId={user.id} profile={profile} name={name} avatarUrl={avatarUrl} />
            {/* Keyed by account so a switch never shows the previous account's draft. */}
            <ProfileNames key={user.id} userId={user.id} profile={profile} />
          </SettingsGroup>
        )}
        <SettingsGroup title="Phone">
          {contacts.error ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 px-6 py-5 text-sm text-destructive">
              Couldn’t load your phone numbers.
              <Button size="sm" variant="outline" onClick={() => void contacts.refetch()}>Try again</Button>
            </div>
          ) : !contacts.data ? (
            <div className="px-6 py-5"><Skeleton className="h-10 w-full" /></div>
          ) : (
            <>
              {contacts.data.loginPhone && (
                // Keyed by account and current value so a switch or a completed change starts clean.
                <ContactChange key={`${user?.id}:${contacts.data.loginPhone}`} purpose="login_phone" label="Account phone"
                  current={contacts.data.loginPhone} resumed={resumed("login_phone")} onChanged={() => contactChanged(true)} />
              )}
              {contacts.data.parentPhone && (
                <ContactChange key={`${user?.id}:${contacts.data.parentPhone}`} purpose="parent_phone" label="Parent phone"
                  current={contacts.data.parentPhone} resumed={resumed("parent_phone")} onChanged={() => contactChanged(false)} />
              )}
            </>
          )}
        </SettingsGroup>
        <SettingsGroup title="Security">
          <PasswordChange key={user?.id} />
          <AccountDeletion key={user?.id} />
        </SettingsGroup>
      </div>
    </main>
  );
}
