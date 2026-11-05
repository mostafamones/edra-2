import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { usePushSubscription } from "../push";

const STATUS: Partial<Record<ReturnType<typeof usePushSubscription>["status"], string>> = {
  unsupported: "Not supported in this browser",
  unconfigured: "Unavailable",
  denied: "Blocked in browser settings",
  error: "Could not update browser notifications",
};

/** This browser's push opt-in. Permission is requested only when the switch is turned on. */
export function PushControl({ push }: { push: ReturnType<typeof usePushSubscription> }) {
  const id = useId();
  const message = STATUS[push.status];
  const usable = push.status === "on" || push.status === "off" || push.status === "error";
  return <div className="space-y-1 border-t px-3 py-2">
    <div className="flex items-center gap-3">
      <Label htmlFor={id} className="flex-1 text-sm font-normal">Browser notifications</Label>
      <Switch id={id} checked={push.status === "on"} disabled={push.busy || !usable}
        onCheckedChange={(checked) => { void (checked ? push.enable() : push.disable()); }} />
    </div>
    {message && <div role={push.status === "error" ? "alert" : "status"} className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="flex-1">{message}</span>
      {(push.status === "denied" || push.status === "error") && <Button type="button" size="sm" variant="ghost" onClick={() => void push.check()}>{push.status === "denied" ? "Check again" : "Try again"}</Button>}
    </div>}
  </div>;
}
