"use client";

import type { ReactNode } from "react";
import { IconUsersGroup } from "@tabler/icons-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { describeAudience, type AudienceNames } from "./names";

type Value = Parameters<typeof describeAudience>[0];

/** The audience fact of the workspace header; a group audience lists its groups in a tooltip. */
export function AudienceFact({ value, names, suffix }: { value: Value; names: AudienceNames; suffix?: ReactNode }) {
  const fact = (
    <span className="flex items-center gap-1.5" tabIndex={value.audience === "groups" ? 0 : undefined}>
      <IconUsersGroup className="size-4" aria-hidden="true" />{describeAudience(value, names)}{suffix}
    </span>
  );
  if (value.audience !== "groups" || value.groupIds.length === 0) return fact;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{fact}</TooltipTrigger>
      <TooltipContent>
        <ul>{value.groupIds.map((id) => <li key={id}>{names.groupNames.get(id) ?? "Unknown group"}</li>)}</ul>
      </TooltipContent>
    </Tooltip>
  );
}
