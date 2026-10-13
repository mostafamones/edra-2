"use client";

import { useState } from "react";
import { IconAlertCircle, IconArchive, IconLock, IconX } from "@tabler/icons-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Kind = "read-only" | "ended" | "archived";

const COPY: Record<Kind, { title: string; description: string }> = {
  "read-only": { title: "Read-only", description: "This academic year is closed, so attendance can no longer change." },
  ended: { title: "This session has ended", description: "Check-ins are closed. You can still correct attendance and finalize it." },
  archived: {
    title: "Archived · not counted",
    description: "These marks are kept for reference only. They don’t count toward attendance totals, and attendance is read-only unless a manager restores the session.",
  },
};

const storageKey = (sessionId: string, kind: Kind) => `edra:attendance:notice:${kind}:${sessionId}`;

function wasDismissed(sessionId: string, kind: Kind) {
  try { return window.localStorage.getItem(storageKey(sessionId, kind)) === "1"; } catch { return false; }
}

/**
 * A heads-up about the sheet's state. Once closed it stays closed for that session on this device;
 * the archived notice cannot be closed, so archived marks are never shown as counted.
 */
export function SheetNotice({ sessionId, kind }: { sessionId: string; kind: Kind }) {
  const [dismissed, setDismissed] = useState(() => kind !== "archived" && wasDismissed(sessionId, kind));
  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try { window.localStorage.setItem(storageKey(sessionId, kind), "1"); } catch { /* it just reappears next time */ }
  }

  const Icon = kind === "archived" ? IconArchive : kind === "read-only" ? IconLock : IconAlertCircle;
  return (
    <div className="border-b px-4 py-3">
      <Alert className="bg-muted/30">
        <Icon />
        <AlertTitle>{COPY[kind].title}</AlertTitle>
        <AlertDescription>{COPY[kind].description}</AlertDescription>
        {kind !== "archived" && (
          <AlertAction>
            <Button variant="ghost" size="icon-xs" aria-label="Dismiss notice" onClick={dismiss}><IconX /></Button>
          </AlertAction>
        )}
      </Alert>
    </div>
  );
}
