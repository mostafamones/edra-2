"use client";

import { useRef, useState } from "react";
import { IconAlertCircle, IconLoader2 } from "@tabler/icons-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { newUuid } from "@/lib/uuid";

export type CorrectionQuestion = { id: string; number: string | number; excluded: boolean; choices: { id: string; position: number; label: string; isCorrect: boolean }[] };
export type CorrectionRequest = { mode: "key" | "exclude"; questionId: string; choiceId: string; expectedScoringRevision: number; key: string };
type Result = { ok: true } | { ok: false; code: string; message: string };
type Props = { question: CorrectionQuestion; mode: CorrectionRequest["mode"]; revision: number; exclusionBlocked?: boolean; current: () => boolean; run: (request: CorrectionRequest) => Promise<Result>; refresh: () => Promise<unknown>; onClose: () => void };

/** Review identity is independent of refresh identity. An uncertain request keeps its exact payload. */
export function ScoringCorrection({ question, mode, revision, exclusionBlocked = false, current, run, refresh, onClose }: Props) {
  const [reviewed, setReviewed] = useState(revision);
  const [choice, setChoice] = useState(question.choices.find((entry) => entry.isCorrect)?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ request: CorrectionRequest; send: Props["run"] } | null>(null);
  const changed = stale || reviewed !== revision;
  const original = question.choices.find((entry) => entry.isCorrect)?.id;
  async function submit() {
    if (busy || (changed && !uncertain)) return;
    const command = pending.current ?? { request: { mode, questionId: question.id, choiceId: choice, expectedScoringRevision: reviewed, key: newUuid() }, send: run };
    pending.current = command;
    setBusy(true); setError(null);
    try {
      const result = await command.send(command.request);
      if (!current()) return;
      if (!result.ok) {
        setError(result.message);
        setUncertain(result.code === "unavailable");
        if (result.code !== "unavailable") pending.current = null;
        if (result.code === "stale_basis") { setStale(true); await refresh(); }
        return;
      }
      pending.current = null; setUncertain(false); await refresh();
      if (current()) onClose();
    } catch {
      if (current()) { setUncertain(true); setError("Save outcome unknown. Retry the original correction to check its receipt."); }
    } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy && !uncertain) onClose(); }}>
    <DialogContent showCloseButton={!busy && !uncertain}>
      <DialogHeader>
        <DialogTitle>{mode === "key" ? `Correct question ${question.number}` : `Exclude question ${question.number}?`}</DialogTitle>
        <DialogDescription>Results recalculate privately. Official results remain unchanged until complete corrections are announced.</DialogDescription>
      </DialogHeader>
      {changed && <Alert><IconAlertCircle /><AlertTitle>Scoring basis changed</AlertTitle><AlertDescription className="flex flex-col items-start gap-2">
        <span>Your selection is kept. Review the latest key and exclusions.</span>
        <Button variant="outline" disabled={busy || uncertain || revision === reviewed} onClick={() => { setReviewed(revision); setStale(false); setError(null); pending.current = null; }}>Review latest scoring basis</Button>
      </AlertDescription></Alert>}
      {error && <Alert variant="destructive"><IconAlertCircle /><AlertTitle>{uncertain ? "Outcome unknown" : "Not changed"}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {mode === "key" && <RadioGroup value={choice} onValueChange={setChoice} disabled={busy || uncertain} aria-label="Correct choice">
        {question.choices.map((entry) => <div key={entry.id} className="flex items-center gap-2">
          <RadioGroupItem value={entry.id} id={`correct-${entry.id}`} /><Label htmlFor={`correct-${entry.id}`}>
            {String.fromCharCode(64 + entry.position)}. {entry.label}{entry.isCorrect ? " (current key)" : ""}
          </Label>
        </div>)}
      </RadioGroup>}
      {mode === "exclude" && exclusionBlocked && <Alert><IconAlertCircle /><AlertTitle>The last scored question must remain</AlertTitle></Alert>}
      <DialogFooter>
        <Button variant="outline" disabled={busy || uncertain} onClick={onClose}>Cancel</Button>
        <Button variant={mode === "exclude" ? "destructive" : "default"} disabled={busy || (!uncertain && (changed || question.excluded || (mode === "key" ? !choice || choice === original : exclusionBlocked)))} onClick={() => void submit()}>
          {busy && <IconLoader2 className="animate-spin" />}{uncertain ? "Retry original correction" : mode === "key" ? "Correct key" : "Exclude question"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
