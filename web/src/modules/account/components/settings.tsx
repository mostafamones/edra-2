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
import { DisplaySettings } from "./display";

/** Personal account settings, shared by the staff `/account` and student `/profile` pages. */
export function AccountSettings() {
  const { user } = useAuth();
  const { profile, name, avatarUrl, isLoading, error, refetch } = useAccountProfile();
  const contacts = useAccountContacts();
  const queryClient = useQueryClient();
  const resumed = (purpose: string) => contacts.data?.operations.find((operation) => operation.purpose === purpose) ?? null;
  const failed = Boolean(error || contacts.error);
  const ready = Boolean(user && !isLoading && profile && contacts.data);

  async function contactChanged(loginPhone: boolean) {
    // A new login phone reaches the session's user (header, menus) only through a refreshed token.
    if (loginPhone) await createClient().auth.refreshSession();
    await queryClient.invalidateQueries({ queryKey: [...accountQueryKeys.all, "contacts"] });
  }

  function retry() {
    if (error) void refetch();
    if (contacts.error) void contacts.refetch();
  }

  return (
    <main className="page-shell min-w-0">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        {failed ? (
          <Alert variant="destructive">
            <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} aria-hidden="true" />
            <AlertDescription className="flex flex-wrap items-center gap-3">
              {error ? "Couldn’t load your profile." : "Couldn’t load your phone numbers."}
              <Button size="sm" variant="outline" onClick={retry}>Try again</Button>
            </AlertDescription>
          </Alert>
        ) : !ready || !user || !profile || !contacts.data ? (
          <AccountSettingsSkeleton />
        ) : (
          <>
            <SettingsGroup title="Profile">
              <ProfilePicture userId={user.id} profile={profile} name={name} avatarUrl={avatarUrl} />
              {/* Keyed by account so a switch never shows the previous account's draft. */}
              <ProfileNames key={user.id} userId={user.id} profile={profile} />
            </SettingsGroup>
            <SettingsGroup title="Phone">
              {contacts.data.loginPhone && (
                // Keyed by account and current value so a switch or a completed change starts clean.
                <ContactChange key={`${user.id}:${contacts.data.loginPhone}`} purpose="login_phone" label="Account phone"
                  current={contacts.data.loginPhone} resumed={resumed("login_phone")} onChanged={() => contactChanged(true)} />
              )}
              {contacts.data.parentPhone && (
                <ContactChange key={`${user.id}:${contacts.data.parentPhone}`} purpose="parent_phone" label="Parent phone"
                  current={contacts.data.parentPhone} resumed={resumed("parent_phone")} onChanged={() => contactChanged(false)} />
              )}
            </SettingsGroup>
            <SettingsGroup title="Display">
              <DisplaySettings key={`display:${user.id}`} />
            </SettingsGroup>
            <SettingsGroup title="Security">
              <PasswordChange key={`password:${user.id}`} />
              <AccountDeletion key={`delete:${user.id}`} />
            </SettingsGroup>
          </>
        )}
      </div>
    </main>
  );
}

function AccountSettingsSkeleton() {
  return (
    <div role="status" aria-label="Loading account settings" className="flex flex-col gap-8">
      <SkeletonGroup titleWidth="w-16">
        <div className="flex items-center gap-4 px-6 py-5">
          <Skeleton className="size-16 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-36" />
          </div>
          <Skeleton className="h-8 w-32 shrink-0" />
        </div>
        <div className="flex min-h-16 items-center justify-between gap-6 px-6 py-5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-48 sm:w-64" />
        </div>
        <div className="flex min-h-16 items-center justify-between gap-6 px-6 py-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-48 sm:w-64" />
        </div>
      </SkeletonGroup>
      <SkeletonGroup titleWidth="w-14">
        <div className="flex items-center justify-between gap-6 px-6 py-5">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex h-5 items-center"><Skeleton className="h-4 w-28" /></div>
            <div className="flex h-5 items-center"><Skeleton className="h-4 w-32" /></div>
          </div>
          <Skeleton className="h-8 w-20 shrink-0" />
        </div>
      </SkeletonGroup>
      <SkeletonGroup titleWidth="w-20">
        <div className="flex items-center justify-between gap-6 px-6 py-5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-36 shrink-0" />
        </div>
        <div className="flex min-h-16 items-center justify-between gap-6 px-6 py-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-32 shrink-0" />
        </div>
      </SkeletonGroup>
    </div>
  );
}

function SkeletonGroup({ titleWidth, children }: { titleWidth: string; children: React.ReactNode }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      <div className="flex h-6 items-center px-2">
        <Skeleton className={`h-4 ${titleWidth}`} />
      </div>
      <div className="divide-y divide-border/60 overflow-hidden rounded-lg bg-card">{children}</div>
    </div>
  );
}
