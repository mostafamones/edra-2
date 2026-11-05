import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRecoverConcern } from "../commands";
import type { ConcernScope } from "../queries";
import { useConcernAttempt } from "./use-attempt";

const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** Accepts a bare concern id or any text (such as a shared link) that contains one. */
export const concernIdFrom = (value: string) => value.match(ID)?.[0].toLowerCase() ?? null;

/**
 * Owner recovery of one concern the Owner names. Nothing is listed or previewed beforehand; the
 * database checks the current Owner role and records the recovery in the concern's history.
 */
export function RecoverConcern({ scope, initialId, onRecovered }: { scope: ConcernScope; initialId?: string; onRecovered: (concernId: string) => void }) {
  const [value, setValue] = useState(initialId ?? "");
  const recover = useRecoverConcern(scope);
  const attempt = useConcernAttempt();
  const concernId = concernIdFrom(value);
  const invalid = value.trim().length > 0 && !concernId;
  return <form className="space-y-3 px-4 pb-4" onSubmit={(event) => {
    event.preventDefault();
    if (!concernId) return;
    void attempt.run((requestId) => recover(concernId, requestId), () => onRecovered(concernId));
  }}>
    <div className="space-y-2"><Label htmlFor="concern-recover">Concern ID or link</Label>
      <Input id="concern-recover" value={value} disabled={attempt.pending || attempt.uncertain} aria-invalid={invalid || undefined}
        aria-describedby={invalid || attempt.failure ? "concern-recover-error" : undefined} onChange={(event) => { setValue(event.target.value); attempt.reset(); }} />
      {(invalid || attempt.failure) && <p id="concern-recover-error" role="alert" className="text-sm text-destructive">{invalid ? "Enter a concern ID or a link that contains one." : attempt.failure?.message}</p>}
    </div>
    {attempt.uncertain ? <Button type="button" disabled={attempt.pending} onClick={attempt.retry}>Retry recovery</Button>
      : <Button type="submit" disabled={attempt.pending || !concernId}>{attempt.pending ? "Recovering…" : "Recover access"}</Button>}
  </form>;
}
