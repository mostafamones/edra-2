"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar03Icon, Cancel01Icon, Copy01Icon, MailAdd01Icon, MoreHorizontalIcon, Tick02Icon, UserIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { copyInvitationLink } from "../clipboard";
import { CardFact } from "./fact";
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
    <Card size="sm" className="h-full gap-4 rounded-xl border-dashed p-4">
      <div className="flex items-start gap-3">
        <div className={cn("flex min-w-0 flex-1 items-start gap-3", !live && "opacity-60")}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <HugeiconsIcon icon={MailAdd01Icon} className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 dir="ltr" className="truncate text-start font-medium tabular-nums text-foreground">{row.phone}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary">{ROLE_LABELS[row.role]}</Badge>
              {!live && <Badge variant="outline">{STATUS_LABELS[row.status]}</Badge>}
            </div>
          </div>
        </div>
        {row.canManage && live && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-1.5 -mt-1 text-muted-foreground" aria-label={`Actions for ${row.phone}`}>
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
      </div>
      <dl className={cn("mt-auto grid gap-1.5 text-xs text-muted-foreground", !live && "opacity-60")}>
        <CardFact icon={UserIcon} label="Invited by"><span dir="auto">Invited by {row.createdByName ?? "—"}</span></CardFact>
        <CardFact icon={Calendar03Icon} label={live || row.status === "expired" ? "Expires" : "Updated"}>
          {live || row.status === "expired" ? "Expires" : "Updated"} {formatDate(lastChange)}
        </CardFact>
      </dl>
    </Card>
  );
}
