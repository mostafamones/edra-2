"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Logout01Icon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { SessionEndReason } from "../session-recovery";

export function SessionRecovery({ reason }: { reason: SessionEndReason }) {
  return <main className="mx-auto flex min-h-svh w-full max-w-md items-center px-5">
    <Alert>
      <HugeiconsIcon icon={Logout01Icon} strokeWidth={1.5} />
      <AlertTitle>{reason === "preview" ? "Developer preview ended" : "Your session has ended"}</AlertTitle>
      <AlertDescription className="gap-4">
        <p>Sign in again to continue on this page.</p>
        <form action={`/auth/signout?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} method="post">
          <Button type="submit">Sign in again</Button>
        </form>
      </AlertDescription>
    </Alert>
  </main>;
}
