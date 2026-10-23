"use client";

import { useQueryClient } from "@tanstack/react-query";
import { IconAlertCircle } from "@tabler/icons-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/modules/auth";

import { accountQueryKeys, useAccountContacts, useAccountProfile } from "../queries";
import { ContactChange } from "./contact";
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
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        {error ? (
          <Alert variant="destructive">
            <IconAlertCircle aria-hidden="true" />
            <AlertDescription className="flex flex-wrap items-center gap-3">
              Couldn’t load your profile.
              <Button size="sm" variant="outline" onClick={() => void refetch()}>Try again</Button>
            </AlertDescription>
          </Alert>
        ) : !user || isLoading || !profile ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <Card>
            <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-6">
              <ProfilePicture userId={user.id} profile={profile} name={name} avatarUrl={avatarUrl} />
              {/* Keyed by account so a switch never shows the previous account's draft. */}
              <ProfileNames key={user.id} userId={user.id} profile={profile} />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle>Phone</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-6">
            {contacts.error ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
                Couldn’t load your phone numbers.
                <Button size="sm" variant="outline" onClick={() => void contacts.refetch()}>Try again</Button>
              </div>
            ) : !contacts.data ? (
              <Skeleton className="h-16 w-full" />
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
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Password</CardTitle></CardHeader>
          <CardContent><PasswordChange key={user?.id} /></CardContent>
        </Card>
      </div>
    </main>
  );
}
