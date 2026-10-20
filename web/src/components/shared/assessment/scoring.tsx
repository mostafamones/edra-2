"use client";

import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CorrectionQuestion } from "./correction";

type Props = { questions: CorrectionQuestion[]; canCorrect: boolean; history: { revision: number; label: string }[]; dialog: (question: CorrectionQuestion, mode: "key" | "exclude", close: () => void) => ReactNode };

/** Shared correction entry/view mechanics. Each domain supplies authority, limits and commands. */
export function ScoringPanel({ questions, canCorrect, history, dialog }: Props) {
  const [selected, setSelected] = useState<{ id: string; mode: "key" | "exclude" } | null>(null);
  const question = questions.find((q) => q.id === selected?.id);
  return <Card>
    <CardHeader><CardTitle>Scoring</CardTitle></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <ol className="flex flex-col divide-y">
        {questions.map((q) => <li key={q.id} className="flex flex-wrap items-center gap-2 py-2">
          <span className="mr-auto">Question {q.number}</span>
          {q.excluded ? <Badge variant="secondary">Excluded</Badge> : <>
            {q.choices.length > 0 && <span className="text-sm">Key: {String.fromCharCode(64 + (q.choices.find((c) => c.isCorrect)?.position ?? 0))}</span>}
            {canCorrect && <>
              {q.choices.length > 0 && <Button variant="outline" size="sm" onClick={() => setSelected({ id: q.id, mode: "key" })}>Correct key</Button>}
              <Button variant="outline" size="sm" onClick={() => setSelected({ id: q.id, mode: "exclude" })}>Exclude</Button>
            </>}
          </>}
        </li>)}
      </ol>
      {history.length > 0 && <ol className="flex flex-col gap-1 text-sm">{history.map((entry) => <li key={entry.revision}>Revision {entry.revision}: {entry.label}</li>)}</ol>}
      {selected && question && dialog(question, selected.mode, () => setSelected(null))}
    </CardContent>
  </Card>;
}
