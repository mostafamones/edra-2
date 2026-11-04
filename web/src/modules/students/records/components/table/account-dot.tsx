import { HugeiconsIcon } from "@hugeicons/react";
import { CircleIcon, UnavailableIcon } from "@hugeicons/core-free-icons";
import { cn } from "cn";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { OnlineAccount } from "../../types";

/** Deliberately long so the status never pops up while scanning the table. */
const STATUS_TOOLTIP_DELAY_MS = 1500;

/**
 * Connection/access state beside a linked record's name. Not presence. Its own provider keeps the
 * delay even right after another (instant) tooltip was shown. An unlinked student gets no dot; a
 * manually suspended one gets a distinct suspension mark instead, so it never reads as linked.
 */
export function AccountDot({ state, manuallySuspended = false }: { state: OnlineAccount; manuallySuspended?: boolean }) {
  const unlinkedSuspended = state === "not_connected" && manuallySuspended;
  if (state === "not_connected" && !unlinkedSuspended) return null;
  const label = state === "connected" ? "Active online access" : "Suspended online access";
  return (
    <TooltipProvider delayDuration={STATUS_TOOLTIP_DELAY_MS} skipDelayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label={label}
            tabIndex={0}
            className="inline-flex shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {unlinkedSuspended
              ? <HugeiconsIcon icon={UnavailableIcon} strokeWidth={1.5} aria-hidden="true" className="size-3.5 text-destructive" />
              : <HugeiconsIcon icon={CircleIcon} aria-hidden="true" className={cn("size-2", state === "suspended" ? "text-destructive" : "text-primary")} />}
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
