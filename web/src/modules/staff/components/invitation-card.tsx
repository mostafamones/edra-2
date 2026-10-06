"use client";

import { useEffect, useRef, useState } from "react";
import { IconCalendar, IconCheck, IconCopy, IconDots, IconMailPlus, IconUser, IconX } from "@tabler/icons-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { copyInvitationLink } from "../clipboard";
import { ROLE_LABELS, STATUS_LABELS, formatDate } from "../format";
import type { InvitationRow } from "../types";

const COPIED_HOLD_MS = 4000;

/** A faded team card for someone who hasn't joined yet. Copy runs in the background and shows a copied state. */
export function InvitationCard({ row, onRevoke }: {
  row: InvitationRow;
  onRevoke: (row: InvitationRow) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyLocked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copyLink(container: HTMLElement) {
    // Hold the copied state for a few seconds to rate-limit repeat copies.
    if (copyLocked.current) return;
    if (!row.invitationLink) {
      toast.error("The link couldn’t be loaded. Refresh the page and try again.");
      return;
    }
    copyLocked.current = true;
    try {
      await copyInvitationLink(row.invitationLink, container);
      setCopied(true);
      timer.current = setTimeout(() => {
        copyLocked.current = false;
        setCopied(false);
      }, COPIED_HOLD_MS);
    } catch {
      copyLocked.current = false;
      toast.error("The link couldn’t be copied. Check your browser’s clipboard permissions and try again.");
    }
  }

  const live = row.status === "pending";
  const lastChange = row.status === "accepted" && row.acceptedAt ? row.acceptedAt
    : row.status === "revoked" && row.revokedAt ? row.revokedAt : row.expiresAt;

  return (
    <Card size="sm" className="h-full gap-0 rounded-lg border-dashed py-0">
      <div className="flex h-20 items-center gap-3 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3 opacity-60">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <IconMailPlus className="size-4" aria-hidden="true" />
          </div>
          <h3 dir="ltr" className="truncate font-medium tabular-nums text-foreground">{row.phone}</h3>
        </div>
        <Badge variant="secondary" className="opacity-60">{live ? ROLE_LABELS[row.role] : STATUS_LABELS[row.status]}</Badge>
        {row.canManage && live && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-1.5 text-muted-foreground" aria-label={`Actions for ${row.phone}`}><IconDots /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={copied} onClick={(event) => void copyLink(event.currentTarget)} onSelect={(event) => event.preventDefault()}>
                {copied ? <IconCheck className="text-emerald-500! group-hover/dropdown-menu-item:text-emerald-500! group-focus/dropdown-menu-item:text-emerald-500! group-data-highlighted/dropdown-menu-item:text-emerald-500!" /> : <IconCopy />}
                {copied ? "Copied" : "Copy link"}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive! hover:text-destructive! focus:text-destructive! data-highlighted:text-destructive! **:text-destructive! hover:**:text-destructive! focus:**:text-destructive! data-highlighted:**:text-destructive!" onSelect={() => onRevoke(row)}><IconX />Revoke</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="mt-auto space-y-1.5 border-t px-4 py-3 text-xs text-muted-foreground opacity-60">
        <p className="flex items-center gap-2"><IconUser className="size-3.5 shrink-0" aria-hidden="true" /><span dir="auto" className="truncate">Invited by {row.createdByName ?? "—"}</span></p>
        <p className="flex items-center gap-2"><IconCalendar className="size-3.5 shrink-0" aria-hidden="true" />{live || row.status === "expired" ? "Expires" : "Updated"} {formatDate(lastChange)}</p>
      </div>
    </Card>
  );
}
