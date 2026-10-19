"use client";

import type { ReactNode } from "react";

import { MarkingGuard } from "./guard";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Row = { recordId: string; fullName: string; studentCode: string | null; groupName: string | null };

type Props<R extends Row> = {
  student: R | null;
  onClose: () => void;
  /** The marks form of the student; call `onSaved` to close the sheet. */
  form: (row: R, api: { onSaved: () => void }) => ReactNode;
};

/** All of one student's parts and feedback, opened from the student list. */
export function StudentMarkSheet<R extends Row>({ student, onClose, form }: Props<R>) {
  return (
    <MarkingGuard>{(request) => <Sheet open={student !== null} onOpenChange={(open) => { if (!open) request(onClose); }}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {student && (
          <>
            <SheetHeader>
              {/* The page font: the heading font's fallback (Arial) would draw Arabic names before Noto Sans Arabic. */}
              <SheetTitle className="text-lg font-semibold" style={{ fontFamily: "inherit" }}>{student.fullName}</SheetTitle>
              <SheetDescription>{[student.studentCode, student.groupName].filter(Boolean).join(" · ") || "No code or group"}</SheetDescription>
            </SheetHeader>
            {form(student, { onSaved: onClose })}
          </>
        )}
      </SheetContent>
    </Sheet>}</MarkingGuard>
  );
}
