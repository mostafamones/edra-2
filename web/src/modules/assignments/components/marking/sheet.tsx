"use client";

import { useState } from "react";
import { IconChecklist } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatScore } from "../../score";
import type { Assignment, StudentWork } from "../../types";
import { MarksForm } from "./form";
import { useMarks } from "../../hooks/use-marks";

const STATE_LABELS: Record<StudentWork["marking"], string> = { unmarked: "Not marked", partial: "Partly marked", complete: "Marked" };

/** The student list renders in a portal outside the sheet; the sheet must not treat it as outside. */
const inStudentList = (target: EventTarget | null) => target instanceof Element && target.closest("[data-slot=combobox-content]") !== null;

/**
 * The marking flow: find a student by name or code, enter their marks, save, and the search is ready
 * for the next student.
 */
export function MarkingSheet({ assignment }: { assignment: Assignment }) {
  const { query, replace } = useMarks(assignment);
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  // Re-mounts the search after each save so it is empty and focused for the next student.
  const [round, setRound] = useState(0);
  const students = query.data?.students ?? [];
  const student = students.find((row) => row.recordId === studentId) ?? null;

  function next() {
    setStudentId(null);
    setTyped("");
    setRound((value) => value + 1);
  }

  return (
    <Sheet open={open} onOpenChange={(value) => { setOpen(value); if (!value) next(); }}>
      <SheetTrigger asChild>
        <Button variant="outline"><IconChecklist />Mark</Button>
      </SheetTrigger>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        onInteractOutside={(event) => { if (inStudentList(event.target)) event.preventDefault(); }}>
        <SheetHeader className="gap-3">
          <SheetTitle>Mark students</SheetTitle>
          {query.isPending ? <Skeleton className="h-9 rounded-md" /> : (
            <Combobox
              key={round}
              items={students}
              value={student}
              inputValue={typed}
              onInputValueChange={setTyped}
              onValueChange={(row: StudentWork | null) => setStudentId(row?.recordId ?? null)}
              itemToStringLabel={(row: StudentWork) => row.fullName}
              filter={(row: StudentWork, search: string) => {
                const needle = search.trim().toLowerCase();
                return row.fullName.toLowerCase().includes(needle) || (row.studentCode?.toLowerCase().includes(needle) ?? false);
              }}
              isItemEqualToValue={(a: StudentWork, b: StudentWork) => a.recordId === b.recordId}
              autoHighlight
            >
              <ComboboxInput placeholder="Find a student by name or code" aria-label="Student" autoComplete="off" autoFocus showTrigger={false} />
              {/* Exactly the input's width (the default extra width pushes it left at the sheet's edge), and clickable
                  although the modal sheet disables pointer events outside itself. */}
              <ComboboxContent className="pointer-events-auto min-w-(--anchor-width)">
                <ComboboxEmpty>No student matches.</ComboboxEmpty>
                <ComboboxList>
                  {(row: StudentWork) => (
                    <ComboboxItem key={row.recordId} value={row} className="pl-3 pr-9">
                      <div className="flex w-full items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{row.fullName}</span>
                          {row.studentCode && <span className="font-mono text-xs text-muted-foreground">{row.studentCode}</span>}
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {row.total === null ? STATE_LABELS[row.marking] : `${formatScore(row.total)} / ${formatScore(assignment.maxScore)}`}
                        </span>
                      </div>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          )}
        </SheetHeader>
        {student ? (
          <MarksForm key={`${student.recordId}-${student.version}`} assignment={assignment} student={student} onChanged={replace} onSaved={next} />
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
            {query.isError ? "Couldn’t load the students. Close and try again." : "Pick a student to enter their marks."}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
