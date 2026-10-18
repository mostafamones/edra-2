"use client";

import { IconAlertCircle } from "@tabler/icons-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/auth";

import { useAccountProfile } from "../queries";
import { ProfileNames } from "./names";
import { PasswordChange } from "./password";
import { ProfilePicture } from "./picture";

/** Personal account settings, shared by the staff `/account` and student `/profile` pages. */
export function AccountSettings() {
  const { user } = useAuth();
  const { profile, name, avatarUrl, isLoading, error, refetch } = useAccountProfile();

  return (
    <main className="page-shell min-w-0">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Account</h1>
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
          <CardHeader><CardTitle>Password</CardTitle></CardHeader>
          <CardContent><PasswordChange key={user?.id} /></CardContent>
        </Card>
      </div>
    </main>
  );
}
