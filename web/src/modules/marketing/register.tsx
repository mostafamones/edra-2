import { useState } from "react";
import { IconCircleCheck, IconMapPin } from "@/components/shared/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ATTENDANCE_STATUSES, AttendanceOverview, SheetTable, type AttendanceStatus, type SheetEntry } from "@/modules/attendance";
import { roster } from "./sample";

/**
 * The real attendance sheet over local sample state. Edits and finalizing stay in the browser;
 * `onFinalize` hands the finalized roster to the sample student record.
 */
export function SampleRegister({ onFinalize }: { onFinalize: (entries: SheetEntry[]) => void }) {
  const [entries, setEntries] = useState(roster);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const counts = { total: entries.length, ...Object.fromEntries(ATTENDANCE_STATUSES.map(status => [status, entries.filter(entry => entry.status === status).length])) } as Record<AttendanceStatus, number> & { total: number };
  const finalized = entries.every(entry => entry.publishedStatus === entry.status);

  const set = (ids: string[], status: AttendanceStatus) => {
    const now = new Date().toISOString();
    setEntries(current => current.map(entry => ids.includes(entry.annualStudentRecordId) && entry.status !== status
      ? { ...entry, status, source: "manual", updatedAt: now, updatedByName: "You", correctionPending: entry.publishedStatus !== null && entry.publishedStatus !== status }
      : entry));
  };
  const finalize = () => {
    const now = new Date().toISOString();
    const next = entries.map(entry => ({ ...entry, publishedStatus: entry.status, publishedAt: now, correctionPending: false }));
    setEntries(next);
    setSelected(new Set());
    onFinalize(next);
  };

  return (
    <Card className="gap-0 overflow-hidden py-0 text-left shadow-xl shadow-primary/5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-5">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-lg font-semibold">Grade 10 Mathematics · Group A</h3>
            <Badge className="gap-1.5"><span className="size-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none" aria-hidden="true" />Live</Badge>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconMapPin className="size-3.5" aria-hidden="true" />Room 3 · Started 4:00 PM
          </p>
        </div>
        {finalized
          ? <Badge variant="secondary" role="status" className="gap-1.5"><IconCircleCheck className="size-3.5" aria-hidden="true" />Finalized</Badge>
          : <Button size="sm" onClick={finalize} disabled={counts.unknown === counts.total}>Finalize attendance</Button>}
      </div>
      <div className="border-b p-4 sm:p-5"><AttendanceOverview counts={counts} /></div>
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2 sm:px-5">
          <span className="mr-auto text-sm tabular-nums">{selected.size} selected</span>
          {(["present", "absent"] as const).map(status => (
            <Button key={status} size="sm" variant="outline" onClick={() => { set([...selected], status); setSelected(new Set()); }}>
              Mark {status}
            </Button>
          ))}
        </div>
      )}
      <SheetTable
        total={entries.length}
        rows={entries}
        editable
        pending={{}}
        selected={selected}
        onSelect={(ids, checked) => setSelected(current => {
          const next = new Set(current);
          ids.forEach(id => checked ? next.add(id) : next.delete(id));
          return next;
        })}
        onStatus={(entry, status) => set([entry.annualStudentRecordId], status)}
        onClearFilters={() => undefined}
      />
    </Card>
  );
}
