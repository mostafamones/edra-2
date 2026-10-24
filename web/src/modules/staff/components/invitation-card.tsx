"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Copy01Icon, MailAdd01Icon, MoreHorizontalIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { copyInvitationLink } from "../clipboard";
import { ROLE_LABELS, STATUS_LABELS, formatDate } from "../format";
import type { InvitationRow } from "../types";

const COPIED_HOLD_MS = 4000;

/** An invitation card; settled (accepted, revoked or expired) invitations are faded. Copy runs in the background and shows a copied state. */
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
    <Card size="sm" className="relative h-full items-center gap-0 rounded-xl border-dashed px-4 pt-7 pb-3 text-center">
      {row.canManage && live && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="absolute top-2 right-2 text-muted-foreground" aria-label={`Actions for ${row.phone}`}>
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={copied} onClick={(event) => void copyLink(event.currentTarget)} onSelect={(event) => event.preventDefault()}>
              {copied ? <HugeiconsIcon icon={Tick02Icon} className="text-emerald-500!" /> : <HugeiconsIcon icon={Copy01Icon} />}
              {copied ? "Copied" : "Copy link"}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => onRevoke(row)}><HugeiconsIcon icon={Cancel01Icon} />Revoke</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <div className={cn("flex w-full min-w-0 flex-1 flex-col items-center", !live && "opacity-60")}>
        {!live && <Badge variant="outline" className="absolute top-3 left-3">{STATUS_LABELS[row.status]}</Badge>}
        <div className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <HugeiconsIcon icon={MailAdd01Icon} className="size-7" aria-hidden="true" />
        </div>
        <h3 dir="ltr" className="mt-4 w-full truncate text-base font-semibold tabular-nums text-foreground">{row.phone}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{ROLE_LABELS[row.role]}</p>
        <div className="mt-5 grid w-full min-w-0 gap-0.5 border-t pt-3 text-xs text-muted-foreground">
          <p dir="auto" className="truncate">Invited by {row.createdByName ?? "—"}</p>
          <p>{live || row.status === "expired" ? "Expires" : "Updated"} {formatDate(lastChange)}</p>
        </div>
      </div>
    </Card>
  );
}
