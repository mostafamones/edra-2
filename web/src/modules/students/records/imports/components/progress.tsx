"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Pause, Play } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAcademyScope, useAuth } from "@/modules/auth";
import { groupDependencyQueryKey } from "@/modules/groups";
import { studentsRootKey } from "../../queries";
import { processStudentImportBatch } from "../actions";
import { type ImportSummary } from "../types";
import { ImportRowsSection } from "./rows-section";

type Props = {
  academyId: string;
  summary: ImportSummary;
  /** Start processing immediately (right after confirmation). After a reload staff resume explicitly. */
  autoStart: boolean;
};

const SKIP_REASONS: Record<string, string> = {
  duplicate_existing: "already in this year",
  duplicate_file: "duplicated within the file",
  invalid: "invalid",
  excluded: "manually excluded",
};

/**
 * Submits confirmed batches one at a time and shows the committed counts. Pausing (or leaving the
 * page) stops after the current batch; nothing continues unattended. Completed batches stay saved.
 */
export function ProgressStep({ academyId, summary, autoStart }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const { user } = useAuth();
  const editable = user?.id === summary.createdBy;
  const stopRequested = useRef(false);
  const started = useRef(false);
  const [running, setRunning] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [error, setError] = useState("");
  const { counts } = summary;
  const rowWord = summary.format === "json" ? "item" : "row";
  const processed = counts.batched - counts.pending;
  const percent = counts.batched > 0 ? Math.round((processed / counts.batched) * 100) : 100;

  // Leaving the page stops further batches after the current request settles.
  useEffect(() => () => { stopRequested.current = true; }, []);
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  async function run() {
    const targetAcademyId = academyId;
    stopRequested.current = false;
    setRunning(true);
    setPausing(false);
    setError("");
    let next = summary.counts.nextBatch;
    try {
      while (next !== null && !stopRequested.current) {
        let result = await processStudentImportBatch(summary.id, next);
        // A lost response is safe to retry: a finished batch returns its stored outcome.
        if (!result.ok && result.code === "unavailable") result = await processStudentImportBatch(summary.id, next);
        if (!isCurrentAcademy(targetAcademyId)) return;
        // The students root covers this import's summary and rows as well as the student list.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: studentsRootKey(targetAcademyId) }),
          queryClient.invalidateQueries({ queryKey: groupDependencyQueryKey(targetAcademyId) }),
        ]);
        if (!result.ok) {
          setError(result.code === "forbidden"
            ? "You no longer have permission to import students. Rows already created stay saved."
            : `${result.message} Rows already created stay saved; resume to try the remaining rows again.`);
          return;
        }
        if (result.data.state !== "importing") return;
        next = result.data.nextBatch;
      }
    } catch {
      if (isCurrentAcademy(targetAcademyId)) setError("The connection was interrupted. Rows already created stay saved; resume to continue.");
    } finally {
      if (isCurrentAcademy(targetAcademyId)) {
        setRunning(false);
        setPausing(false);
      }
    }
  }

  useEffect(() => {
    if (!autoStart || !editable || started.current || summary.state !== "importing") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      started.current = true;
      void run();
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, summary.state, editable]);

  const skippedBreakdown = Object.entries(counts.skippedByCode)
    .map(([code, count]) => `${count.toLocaleString("en")} ${SKIP_REASONS[code] ?? code}`).join(", ");
  const stats = [
    { label: "Created", value: counts.created },
    { label: "Skipped", value: counts.skipped, detail: skippedBreakdown },
    { label: "Failed", value: counts.failed },
    { label: "Pending", value: counts.pending },
  ];

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="import-progress-heading" className="flex flex-col gap-4 rounded-lg border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="import-progress-heading" className="font-medium">
              {summary.state === "completed" ? "Results" : "Importing"}
            </h2>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {summary.state === "completed" ? "The import finished."
                : running ? (pausing ? "Pausing after the current batch…" : `Creating students… ${processed.toLocaleString("en")} of ${counts.batched.toLocaleString("en")} processed.`)
                  : summary.state === "blocked" ? "The import stopped."
                    : `Paused with ${counts.pending.toLocaleString("en")} students still to import.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.state === "importing" && editable && (running ? (
              <Button variant="outline" onClick={() => { stopRequested.current = true; setPausing(true); }} disabled={pausing}>
                <Pause />{pausing ? "Pausing…" : "Pause"}
              </Button>
            ) : (
              <Button onClick={() => void run()}><Play />{processed > 0 ? "Resume import" : "Start import"}</Button>
            ))}
          </div>
        </div>
        <Progress value={percent} aria-label="Import progress" aria-valuetext={`${processed} of ${counts.batched} processed`} />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-md bg-muted/40 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{stat.value.toLocaleString("en")}</dd>
              {stat.detail && <dd className="text-xs text-muted-foreground">{stat.detail}</dd>}
            </div>
          ))}
        </dl>
      </section>

      {summary.state === "blocked" && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>The academic year is closed</AlertTitle>
          <AlertDescription>
            {counts.pending.toLocaleString("en")} students weren’t imported because the year this import was prepared for closed. Students already created stay saved.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Import paused</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ImportRowsSection
        academyId={academyId}
        sessionId={summary.id}
        mode="results"
        rowWord={rowWord}
      />
    </div>
  );
}
