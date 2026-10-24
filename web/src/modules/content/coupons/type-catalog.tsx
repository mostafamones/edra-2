"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { couponTypeGroups, type AvailableCouponType, type CouponScope } from "./types";

export function CouponTypeCatalog({ types, scope, defaultId, manager, disabled, onCreate, onEdit, onRemove }: {
  types: AvailableCouponType[]; scope: CouponScope; defaultId?: string; manager: boolean; disabled: boolean;
  onCreate: () => void; onEdit: (type: AvailableCouponType) => void; onRemove: (type: AvailableCouponType) => void;
}) {
  return <div className="space-y-6">
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-heading text-lg font-semibold">Coupon types</h2>
      <Button disabled={disabled} onClick={onCreate}><HugeiconsIcon icon={Add01Icon} strokeWidth={1.5} />New type</Button>
    </div>
    {couponTypeGroups(types, scope).map(group => <section key={group.label} className="space-y-3" aria-label={group.label}>
      <h3 className="text-sm font-medium text-muted-foreground">{group.label}</h3>
      <div className="divide-y rounded-xl bg-muted/40">
        {group.types.map(type => <div key={type.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <span className="font-medium" dir="auto">{type.name}</span>
            <Badge variant="outline" className="font-mono">{type.prefix}</Badge>
            {type.id === defaultId && <Badge variant="secondary">Default</Badge>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="ghost" disabled={disabled} aria-label={`Edit type ${type.name} · ${group.label}`} onClick={() => onEdit(type)}>Edit</Button>
            {manager && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={disabled || type.isDefault || type.virtual} aria-label={`Remove type ${type.name} · ${group.label}`} onClick={() => onRemove(type)}>Remove</Button>}
          </div>
        </div>)}
      </div>
    </section>)}
  </div>;
}
