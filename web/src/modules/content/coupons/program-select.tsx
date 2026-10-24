"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { scopeLabel, type CouponScope } from "./types";

/** Borderless trigger for selects that sit inside settings rows. */
export const GHOST_TRIGGER = "border-transparent bg-transparent shadow-none hover:bg-muted dark:bg-transparent dark:hover:bg-muted";

/** Picks one active-year program for coupon types and generation. */
export function ProgramSelect({ id, programs, value, disabled, onChange, size }: { id: string; programs: CouponScope[]; value: string; disabled?: boolean; onChange: (id: string) => void; size?: "sm" | "default" }) {
  return <Select value={value} disabled={disabled} onValueChange={onChange}>
    <SelectTrigger id={id} size={size} aria-label={size === "sm" ? "Coupon program" : undefined} className={size === "sm" ? GHOST_TRIGGER : "w-full"}><SelectValue /></SelectTrigger>
    <SelectContent>{programs.map(p => <SelectItem key={p.id} value={p.id}>{scopeLabel(p)}</SelectItem>)}</SelectContent>
  </Select>;
}
