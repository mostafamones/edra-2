import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Calendar03Icon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { academyDateTime, academyInstant, formatAcademyLong, formatAcademyRelative } from "@/lib/academy-time";
import { AssessmentDateTime } from "@/modules/assessments";
import { useAcademyScope } from "@/modules/auth";
import { cancelUnitPublication, scheduleUnitPublication } from "../actions";
import type { UnitPublication } from "../data";
import { publicationOptions } from "../panels";
import { unwrapContent } from "../types";

type PublicationQuery = UseQueryResult<UnitPublication>;

/** The unit's schedule for a manager. A worker outcome refreshes the unit, but not over unsaved edits. */
export function usePublication({ academyId, unitId, userId, enabled, dirty }: { academyId: string; unitId: string; userId: string; enabled: boolean; dirty: boolean }) {
  const cache = useQueryClient();
  const query = useQuery({ ...publicationOptions(academyId, unitId, userId), enabled });
  const state = query.data?.schedule?.state;
  const seen = useRef(state);
  useEffect(() => {
    if (seen.current === "pending" && state !== "pending") {
      if (dirty) return;
      void cache.invalidateQueries({ queryKey: ["content", academyId] });
    }
    seen.current = state;
  }, [state, dirty, cache, academyId]);
  return query;
}

/** The editor's header control for the unit's schedule; it opens the schedule dialog directly.
 * `dirty`: unsaved edits, which scheduling waits for because it may save the draft as the version to publish. */
export function PublicationButton({ academyId, unitId, query, dirty }: { academyId: string; unitId: string; query: PublicationQuery; dirty: boolean }) {
  const [open, setOpen] = useState(false);
  const schedule = query.data?.schedule;
  const pending = schedule?.state === "pending", stopped = schedule?.state === "stopped";
  const label = pending ? `Scheduled ${formatAcademyRelative(schedule.scheduledFor)}` : stopped ? "Publication stopped" : "Schedule";
  return <>
    <Tooltip><TooltipTrigger asChild>
      <Button variant="outline" aria-label={label} disabled={!query.data} className={stopped ? "text-destructive hover:text-destructive" : undefined} onClick={() => setOpen(true)}>
        <HugeiconsIcon icon={stopped ? Alert02Icon : Calendar03Icon} strokeWidth={1.5} aria-hidden="true" /><span className="hidden lg:inline">{label}</span>
      </Button>
    </TooltipTrigger><TooltipContent>{pending ? `${formatAcademyLong(schedule.scheduledFor)} Cairo` : label}</TooltipContent></Tooltip>
    {open && <ScheduleDialog academyId={academyId} unitId={unitId} schedule={pending || stopped ? schedule : null} dirty={dirty} onClose={() => setOpen(false)} />}
  </>;
}

type OpenSchedule = NonNullable<UnitPublication["schedule"]>;
const WEEK = 7 * 86_400_000, FIVE_MINUTES = 300_000;

/** The schedule dialog for a unit outside its editor, shown once its schedule has loaded. */
export function ScheduleUnitDialog({ academyId, unitId, userId, onClose, onCloseAutoFocus }: { academyId: string; unitId: string; userId: string; onClose: () => void; onCloseAutoFocus?: (event: Event) => void }) {
  const query = useQuery(publicationOptions(academyId, unitId, userId));
  const failed = query.isError;
  useEffect(() => { if (failed) { toast.error("Couldn’t load this unit’s schedule."); onClose(); } }, [failed, onClose]);
  if (!query.data) return null;
  const schedule = query.data.schedule;
  return <ScheduleDialog academyId={academyId} unitId={unitId} schedule={schedule?.state === "pending" || schedule?.state === "stopped" ? schedule : null} dirty={false} onClose={onClose} onCloseAutoFocus={onCloseAutoFocus} />;
}

function ScheduleDialog({ academyId, unitId, schedule, dirty, onClose, onCloseAutoFocus }: { academyId: string; unitId: string; schedule: OpenSchedule | null; dirty: boolean; onClose: () => void; onCloseAutoFocus?: (event: Event) => void }) {
  const cache = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  // Cairo wall time, YYYY-MM-DDTHH:mm. A new schedule starts a week out, on the next five minutes.
  const [value, setValue] = useState(() => {
    const start = academyDateTime(schedule?.scheduledFor ?? new Date(Math.ceil((Date.now() + WEEK) / FIVE_MINUTES) * FIVE_MINUTES).toISOString());
    return `${start.date}T${start.time}`;
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  // Schedule changes leave the unit itself alone, so its draft isn't reloaded under someone's edits.
  const refresh = () => Promise.all([
    cache.invalidateQueries({ queryKey: ["content", academyId, "unit", unitId, "publication"] }),
    cache.invalidateQueries({ queryKey: ["content", academyId, "workspace"] }),
    // Scheduling with no saved version saves one into history.
    cache.invalidateQueries({ queryKey: ["content", academyId, "unit", unitId, "panels"] }),
  ]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const [date = "", time = ""] = value.split("T");
    if (!date || !time) { setError("Choose a date and time."); return; }
    const at = academyInstant(date, time);
    if (!at) { setError("That date or time doesn’t exist in Cairo time."); return; }
    // The server decides; this only saves a round trip.
    if (Date.parse(at) <= Date.now()) { setError("Choose a future time."); return; }
    setBusy(true); setError("");
    try {
      unwrapContent(await scheduleUnitPublication({ academyId, unitId, date, time, generation: schedule?.generation ?? 0 }));
      if (!isCurrentAcademy(academyId)) return;
      toast.success(schedule ? "Publication rescheduled." : "Publication scheduled.");
      await refresh();
      onClose();
    } catch (e) {
      if (!isCurrentAcademy(academyId)) return;
      setError(e instanceof Error ? e.message : "Could not schedule this publication.");
      await refresh();
    } finally { setBusy(false); }
  }
  async function cancel(generation: number) {
    setBusy(true); setError("");
    try {
      const { state } = unwrapContent(await cancelUnitPublication({ academyId, unitId, generation }));
      if (!isCurrentAcademy(academyId)) return;
      await refresh();
      // The worker may have won the race; report what actually happened.
      if (state === "cancelled") { toast.success("Schedule cancelled."); onClose(); }
      else setError(state === "published" ? "This schedule had already published." : "This schedule changed. Review it and try again.");
    } catch (e) { if (isCurrentAcademy(academyId)) { setError(e instanceof Error ? e.message : "Could not cancel this schedule."); await refresh(); } }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={next => { if (!next && !busy) onClose(); }}>
    <DialogContent aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus}>
      <DialogHeader><DialogTitle>{schedule ? "Reschedule publication" : "Schedule publication"}</DialogTitle></DialogHeader>
      {schedule?.state === "stopped" && <Alert variant="destructive"><HugeiconsIcon icon={Alert02Icon} strokeWidth={1.5} /><AlertTitle>Publication stopped</AlertTitle><AlertDescription>{schedule.reason}</AlertDescription></Alert>}
      <form onSubmit={event => void submit(event)} className="flex flex-col gap-4">
        <Field><FieldLabel htmlFor="publish-at">Publish at</FieldLabel>
          <AssessmentDateTime id="publish-at" label="Publish at" relative value={value} onChange={setValue} disabled={busy} invalid={!!error} /></Field>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          {schedule && <Button type="button" variant="ghost" className="sm:mr-auto" disabled={busy} onClick={() => void cancel(schedule.generation)}>{schedule.state === "pending" ? "Cancel schedule" : "Dismiss"}</Button>}
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Close</Button>
          <Button type="submit" disabled={busy || dirty}>{busy || dirty ? "Saving…" : schedule ? "Reschedule" : "Schedule"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
