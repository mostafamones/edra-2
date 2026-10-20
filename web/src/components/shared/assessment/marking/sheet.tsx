"use client";

import { useState, type ReactNode } from "react";
import { IconChecklist } from "@tabler/icons-react";

import { MarkingGuard } from "./guard";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Row = { recordId: string; fullName: string; studentCode: string | null };

type Props<R extends Row> = {
  /** Why nothing can be marked yet: the button stays, disabled, with this as its tooltip. */
  disabled?: string;
  roster: { isPending: boolean; isError: boolean; rows: R[] };
  /** What the student's row says on the right: a total, or where their marking stands. */
  summary: (row: R) => ReactNode;
  /** The marks form of the chosen student; call `onSaved` to go on to the next one. */
  form: (row: R, api: { onSaved: () => void }) => ReactNode;
};

/** The student list renders in a portal outside the sheet; the sheet must not treat it as outside. */
const inStudentList = (target: EventTarget | null) => target instanceof Element && target.closest("[data-slot=combobox-content]") !== null;

/**
 * The marking flow every assessment shares: find a student by name or code, enter their marks, save,
 * and the search is ready for the next student.
 */
export function MarkingSheet<R extends Row>({ disabled, roster, summary, form }: Props<R>) {
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

  return (
    <MarkingGuard>{(request) => <Sheet open={open} onOpenChange={(value) => { if (value) setOpen(true); else request(() => { setOpen(false); next(); }); }}>
      {disabled ? (
        <Tooltip>
          {/* A disabled button gets no hover or focus, so the tooltip hangs on a wrapper. */}
          <TooltipTrigger asChild><span tabIndex={0}><Button variant="outline" disabled><IconChecklist />Mark</Button></span></TooltipTrigger>
          <TooltipContent>{disabled}</TooltipContent>
        </Tooltip>
      ) : (
        <SheetTrigger asChild>
          <Button variant="outline"><IconChecklist />Mark</Button>
        </SheetTrigger>
      )}
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        onInteractOutside={(event) => { if (inStudentList(event.target)) event.preventDefault(); }}>
        <SheetHeader className="gap-3">
          <SheetTitle>Mark students</SheetTitle>
          {roster.isPending ? <Skeleton className="h-9 rounded-md" /> : (
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
          )}
        </SheetHeader>
        {student ? form(student, { onSaved: next }) : (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
            {roster.isError ? "Couldn’t load the students. Close and try again." : "Pick a student to enter their marks."}
          </div>
        )}
      </SheetContent>
    </Sheet>}</MarkingGuard>
  );
}
