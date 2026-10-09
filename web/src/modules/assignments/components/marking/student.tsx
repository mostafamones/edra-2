"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Assignment, StudentWork } from "../../types";
import { MarksForm } from "./form";

type Props = {
  assignment: Assignment;
  student: StudentWork | null;
  onClose: () => void;
  onChanged: (student: StudentWork) => void;
  /** Called with the saved row after marks were saved (not on a conflict). */
  onSaved?: (student: StudentWork) => void;
};

/** All of one student's parts and feedback. Work is recorded as received by the first mark. The body re-mounts on every new version, so it always shows the saved values. */
export function StudentSheet({ assignment, student, onClose, onChanged, onSaved }: Props) {
  return (
    <Sheet open={student !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {student && (
          <>
            <SheetHeader>
              {/* The page font: the heading font's fallback (Arial) would draw Arabic names before Noto Sans Arabic. */}
              <SheetTitle className="text-lg font-semibold" style={{ fontFamily: "inherit" }}>{student.fullName}</SheetTitle>
              <SheetDescription>{[student.studentCode, student.groupName].filter(Boolean).join(" · ") || "No code or group"}</SheetDescription>
            </SheetHeader>
            <MarksForm key={student.version} assignment={assignment} student={student} onChanged={onChanged} onSaved={(saved) => { onSaved?.(saved); onClose(); }} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
