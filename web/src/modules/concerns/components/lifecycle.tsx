import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { useConcernLifecycle } from "../commands";
import { CONCERN_BODY_MAX, type ConcernDetail } from "../validation";
import { useConcernAttempt } from "./use-attempt";

/** Written settlement outcome or reopening reason. The text survives a failed or stale attempt. */
export function ConcernLifecycleForm({ mode, detail, lifecycle, onClose }: {
  mode: "settle" | "reopen"; detail: ConcernDetail; lifecycle: ReturnType<typeof useConcernLifecycle>; onClose: () => void;
}) {
  const settling = mode === "settle";
  const [text, setText] = useState("");
  const attempt = useConcernAttempt();
  const id = settling ? "concern-outcome" : "concern-reason";
  const submit = () => {
    if (!text.trim()) return;
    // The decision is made on the version currently shown; a newer state is refused as stale.
    const version = detail.version;
    const value = text;
    void attempt.run((requestId) => settling ? lifecycle.settle(value, version, requestId) : lifecycle.reopen(value, version, requestId), onClose);
  };
  return <form className="shrink-0 space-y-2 border-t p-3" onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <Label htmlFor={id}>{settling ? "Outcome" : "Reason for reopening"}</Label>
    <Textarea id={id} required autoFocus value={text} maxLength={CONCERN_BODY_MAX} disabled={attempt.pending || attempt.uncertain}
      aria-invalid={attempt.failure?.code === "validation" || undefined} aria-describedby={attempt.failure ? `${id}-error` : undefined}
      className="max-h-40 min-h-20 resize-none overflow-y-auto" dir="auto" onChange={(event) => { setText(event.target.value); attempt.reset(); }} />
    {attempt.failure && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{attempt.failure.message}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" size="sm" variant="ghost" disabled={attempt.pending} onClick={onClose}>Cancel</Button>
      {attempt.uncertain ? <Button type="button" size="sm" disabled={attempt.pending} onClick={attempt.retry}>{settling ? "Retry settlement" : "Retry reopening"}</Button>
        : <Button type="submit" size="sm" disabled={attempt.pending || !text.trim()}>{attempt.pending ? (settling ? "Settling…" : "Reopening…") : settling ? "Settle concern" : "Reopen concern"}</Button>}
    </div>
  </form>;
}
