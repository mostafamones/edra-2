"use client";

import { IconAlertTriangle } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function AuthLoadError({ message, onRetry, retrying }: { message: string; onRetry: () => void; retrying: boolean }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md items-center px-5">
      <Alert variant="destructive">
        <IconAlertTriangle aria-hidden="true" />
        <AlertTitle>We couldn’t load your account</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>{message}</span>
          <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
            {retrying ? "Retrying…" : "Try again"}
          </Button>
        </AlertDescription>
      </Alert>
    </main>
  );
}
