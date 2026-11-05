import type { ComponentProps } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ConcernIconButton({ label, icon, ...props }: ComponentProps<typeof Button> & { label: string; icon: ComponentProps<typeof HugeiconsIcon>["icon"] }) {
  return <Tooltip><TooltipTrigger asChild><Button type="button" size="icon-sm" variant="ghost" aria-label={label} {...props}>
    <HugeiconsIcon icon={icon} strokeWidth={1.5} aria-hidden="true" />
  </Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}
