"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconLoader2 } from "@tabler/icons-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAcademyScope, useAuth } from "@/modules/auth";
import { changeStructure, previewStructureChange } from "../actions";
import { academyStructureKey, offeringAffectedKeys } from "../query-keys";
import type { AcademyStructure, OfferingChange, OfferingPreview, OfferingRequest } from "../validation";

export type OfferingTransitionChange = Extract<OfferingChange, { operation: "remove_track" | "remove_level" | "stop_level" | "resume_level" }>;
const titles = { remove_track: "Remove track", remove_level: "Remove level", stop_level: "Stop offering", resume_level: "Resume offering" };
const consequences = {
  remove_track: "Current students keep their level and primary group. Groups and future teaching become level-wide. Active assignments and current content broaden; existing exam audiences become fixed rosters. Work, required assignment cohorts, sessions and closed-year history are preserved.",
  remove_level: "Permanently remove this unused academy offering. The catalog level remains. Any dependent record, including archived records and history, blocks removal.",
  stop_level: "Archive current students and groups, stop future teaching and released-material access, and end submission availability. Live sessions, running attempts and open assessments shared with other levels block stopping. Accounts, work and history remain available for staff marking and results.",
  resume_level: "Make this offering available again. Students, groups and schedules remain archived. Assessments stay closed and old learning access stays inactive. Restoration requires explicit compatible domain actions.",
};
const labels: Record<string, string> = {
  students: "Current students", groups: "Current groups", schedules: "Schedules", assignments: "Assignments", exams: "Exams", contentPrograms: "Content programs",
  liveSessions: "Live sessions", runningAttempts: "Running attempts", unattachedQuizzes: "Unattached quizzes requiring review", sharedAssessments: "Open assessments shared across levels",
  sessions: "Session history", archivedStudents: "Archived and previous-year students", closedAssignments: "Closed assignment history",
};

export function OfferingTransition({ slug, academyId, accountId, change, onClose, onCommitted }: {
  slug: string; academyId: string; accountId: string; change: OfferingTransitionChange;
  onClose: () => void; onCommitted: (value: AcademyStructure) => void;
}) {
  const client = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const { user } = useAuth();
  const account = useRef(user?.id);
  useLayoutEffect(() => { account.current = user?.id; return () => { account.current = undefined; }; }, [user?.id]);
  const current = () => isCurrentAcademy(academyId) && account.current === accountId;
  const [pending, startTransition] = useTransition();
  const [request, setRequest] = useState<OfferingRequest | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [changed, setChanged] = useState<OfferingPreview | null>(null);
  const [requiresReview, setRequiresReview] = useState(false);
  const query = useQuery({ queryKey: [...academyStructureKey(accountId, academyId), "preview", change], retry: false,
    queryFn: async () => { const result = await previewStructureChange(slug, change); if (!result.ok) throw new Error(result.message); return result.value; } });
  const preview = changed ?? query.data;
  const blocked = preview && Object.values(preview.blockers).some(count => count > 0);

  function confirm() {
    if (!preview || blocked || requiresReview) return;
    const sending = request ?? { change, revision: preview.revision, fingerprint: preview.fingerprint, requestKey: crypto.randomUUID() };
    setRequest(sending);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await changeStructure(slug, sending);
        if (!result.ok) {
          if (current()) { setMessage(result.message); if (result.code !== "unavailable") setRequest(null); }
        } else if (result.value.outcome === "committed") {
          void Promise.allSettled(offeringAffectedKeys(accountId, academyId).map(queryKey => client.invalidateQueries({ queryKey })));
          if (current()) onCommitted(result.value.structure);
        } else if (current()) {
          setChanged(result.value.preview); setRequest(null); setRequiresReview(true);
          setMessage(result.value.outcome === "conflict" ? "The impact changed. Review the latest impact before confirming again." : "Resolve the blockers before confirming this change.");
        }
      } catch { if (current()) setMessage("The outcome is unknown. Retry to check the same request."); }
    });
  }

  return <AlertDialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{titles[change.operation]}</AlertDialogTitle>
        <AlertDialogDescription>{consequences[change.operation]}</AlertDialogDescription>
      </AlertDialogHeader>
      {query.isPending && <p role="status"><IconLoader2 className="inline animate-spin" aria-hidden="true" /> Loading impact</p>}
      {query.isError && <Alert variant="destructive"><AlertDescription>Couldn’t load the impact. <Button variant="outline" size="sm" onClick={() => void query.refetch()}>Retry</Button></AlertDescription></Alert>}
      {preview && <div className="max-h-80 space-y-4 overflow-y-auto text-sm">
        <ImpactCounts title="Changes" counts={preview.changes} />
        <ImpactCounts title="Preserved history" counts={preview.preserved} />
        {blocked && <ImpactCounts title="Blockers" counts={preview.blockers} />}
      </div>}
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        {requiresReview ? <Button variant="outline" disabled={pending} onClick={() => {
          setChanged(null); setRequiresReview(false); setMessage(null); void query.refetch();
        }}>Review latest impact</Button> : <Button variant={change.operation === "resume_level" ? "default" : "destructive"}
          disabled={pending || !preview || query.isFetching || Boolean(blocked)} onClick={confirm}>
          {pending && <IconLoader2 className="animate-spin" aria-hidden="true" />}{request ? "Retry confirmation" : "Confirm"}
        </Button>}
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

function ImpactCounts({ title, counts }: { title: string; counts: Record<string, number> }) {
  const values = Object.entries(counts).filter(([, count]) => count > 0);
  return <section><h2 className="font-medium">{title}</h2>{values.length ? <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
    {values.map(([key, count]) => <div key={key} className="contents"><dt>{labels[key] ?? key.replaceAll("_", " ")}</dt><dd>{count}</dd></div>)}
  </dl> : <p>None</p>}</section>;
}
