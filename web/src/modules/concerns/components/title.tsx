import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FloatingSheetTitle } from "@/components/ui/floating-sheet";
import { Input } from "@/components/ui/input";
import { useConcernLifecycle } from "../commands";
import { useConcernDetail, type ConcernScope } from "../queries";
import { CONCERN_TITLE_MAX } from "../validation";
import { useConcernAttempt } from "./use-attempt";

/** The open concern's sheet title. Leadership can double-click (or press Enter) to rename an ongoing concern. */
export function ConcernTitle({ scope, concernId, fallback, active, onDenied }: { scope: ConcernScope; concernId: string; fallback: string; active: boolean; onDenied: () => void }) {
  const detail = useConcernDetail(scope, concernId, active);
  const lifecycle = useConcernLifecycle(scope, concernId, onDenied);
  const attempt = useConcernAttempt();
  const [draft, setDraft] = useState<string | null>(null);
  const title = detail.data?.title ?? fallback;
  const editable = !!detail.data?.canManage && detail.data.status === "ongoing";
  const close = () => { setDraft(null); attempt.reset(); };
  const save = () => {
    if (draft === null || attempt.pending) return;
    if (attempt.uncertain) return attempt.retry();
    const next = draft.trim();
    if (!next || next === title) return close();
    void attempt.run((requestId) => lifecycle.rename(next, requestId), close);
  };
  if (draft === null) return <FloatingSheetTitle className="min-w-0 flex-1 truncate" title={title} dir="auto"
    {...editable && { tabIndex: 0, "aria-keyshortcuts": "Enter", onDoubleClick: () => setDraft(title), onKeyDown: (event: React.KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); setDraft(title); } } }}>{title}</FloatingSheetTitle>;
  return <div className="min-w-0 flex-1">
    <FloatingSheetTitle className="sr-only">{title}</FloatingSheetTitle>
    <div className="flex items-center gap-2">
      <Input variant="line" data-concern-title-edit="" aria-label="Concern title" autoFocus value={draft} maxLength={CONCERN_TITLE_MAX} dir="auto" className="h-8 border-input px-0 text-base font-semibold md:text-base"
        disabled={attempt.pending || attempt.uncertain} aria-invalid={!!attempt.failure || undefined}
        aria-describedby={attempt.failure ? `${concernId}-title-error` : undefined}
        onFocus={(event) => event.currentTarget.select()} onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (!attempt.failure) save(); }}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save(); } else if (event.key === "Escape") { event.preventDefault(); close(); } }} />
      {attempt.uncertain && <Button type="button" size="sm" disabled={attempt.pending} onClick={attempt.retry}>Retry</Button>}
      {attempt.failure && <Button type="button" size="sm" variant="ghost" onClick={close}>Cancel</Button>}
    </div>
    {attempt.failure && <p id={`${concernId}-title-error`} role="alert" className="mt-1 text-xs text-destructive">{attempt.failure.message}</p>}
  </div>;
}
