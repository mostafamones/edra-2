"use client";

import { useState, type ReactNode } from "react";
import { IconChecklist } from "@tabler/icons-react";

import { MarkingGuard } from "./guard";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

type Row = { recordId: string; fullName: string; studentCode: string | null };
type Guard = (action: () => void) => void;

type Props<R extends Row> = {
  /** Nothing can be marked yet: the Mark button is hidden. */
  unavailable?: boolean;
  roster: { isPending: boolean; isError: boolean; rows: R[] };
  /** What the student's row says on the right: a total, or where their marking stands. */
  summary: (row: R) => ReactNode;
  /** The marks form of the chosen student; call `onSaved` to go on to the next one. */
  form: (row: R, api: { onSaved: () => void }) => ReactNode;
  /** Renders inline in the caller's own sheet, under its guard, without the Mark button and sheet. */
  embedded?: Guard;
};

/** The student list renders in a portal outside the sheet; the sheet must not treat it as outside. */
export const inStudentList = (target: EventTarget | null) => target instanceof Element && target.closest("[data-slot=combobox-content]") !== null;

/**
 * The marking flow every assessment shares: find a student by name or code, enter their marks, save,
 * and the search is ready for the next student.
 */
export function MarkingSheet<R extends Row>({ unavailable, roster, summary, form, embedded }: Props<R>) {
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  // Re-mounts the search after each save so it is empty and focused for the next student.
  const [round, setRound] = useState(0);
  const student = roster.rows.find((row) => row.recordId === studentId) ?? null;

  function next() {
    setStudentId(null);
    setTyped("");
    setRound((value) => value + 1);
  }

  const search = (request: Guard) => roster.isPending ? <Skeleton className="h-9 rounded-md" /> : (
    <Combobox
      key={round}
      items={roster.rows}
      value={student}
      inputValue={typed}
      onInputValueChange={setTyped}
      onValueChange={(row: R | null) => { if (row?.recordId !== studentId) request(() => setStudentId(row?.recordId ?? null)); }}
      itemToStringLabel={(row: R) => row.fullName}
      filter={(row: R, search: string) => {
        const needle = search.trim().toLowerCase();
        return row.fullName.toLowerCase().includes(needle) || (row.studentCode?.toLowerCase().includes(needle) ?? false);
      }}
      isItemEqualToValue={(a: R, b: R) => a.recordId === b.recordId}
      autoHighlight
    >
      <ComboboxInput placeholder="Find a student by name or code" aria-label="Student" autoComplete="off" autoFocus showTrigger={false} />
      {/* Exactly the input's width (the default extra width pushes it left at the sheet's edge), and clickable
          although the modal sheet disables pointer events outside itself. */}
      <ComboboxContent className="pointer-events-auto min-w-(--anchor-width)">
        <ComboboxEmpty>No student matches.</ComboboxEmpty>
        <ComboboxList>
          {(row: R) => (
            <ComboboxItem key={row.recordId} value={row} className="pl-3 pr-9">
              <div className="flex w-full items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{row.fullName}</span>
                  {row.studentCode && <span className="font-mono text-xs text-muted-foreground">{row.studentCode}</span>}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{summary(row)}</span>
              </div>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
  const chosen = student ? form(student, { onSaved: next }) : (
    <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
      {roster.isError ? "Couldn’t load the students. Close and try again." : "Pick a student to enter their marks."}
    </div>
  );

  if (embedded) return <><div className="p-4">{search(embedded)}</div>{chosen}</>;
  if (unavailable) return null;
  return (
    <MarkingGuard>{(request) => <Sheet open={open} onOpenChange={(value) => { if (value) setOpen(true); else request(() => { setOpen(false); next(); }); }}>
      <SheetTrigger asChild>
        <Button variant="outline"><IconChecklist />Mark</Button>
      </SheetTrigger>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        onInteractOutside={(event) => { if (inStudentList(event.target)) event.preventDefault(); }}>
        <SheetHeader className="gap-3">
          <SheetTitle>Mark students</SheetTitle>
          {search(request)}
        </SheetHeader>
        {chosen}
      </SheetContent>
    </Sheet>}</MarkingGuard>
  );
}
