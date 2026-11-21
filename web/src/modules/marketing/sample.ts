import type { ComponentProps } from "react";
import type { SheetEntry } from "@/modules/attendance";
import type { LearningHome } from "@/modules/learning";
import type { ResultsChart, StudentAttendance, StudentRecord } from "@/modules/students";

/** A fictional academy rendered through Edra's real components. Never sent to or read from the server. */
export const academy = { name: "Nile Academy", slug: "nile" };
export const sessionStartedAt = "2026-11-24T14:00:00Z";

type Read<T> = { data: T; error: null; isPending: false; isFetching: false; refetch: () => Promise<unknown> };
/** A settled read in the shape `QueryContent` accepts. */
export const settled = <T,>(data: T) => ({ data, error: null, isPending: false, isFetching: false, refetch: async () => undefined }) satisfies Read<T>;




const names = ["Mariam Hassan", "Omar Nasser", "Youssef Ali", "Salma Adel", "Karim Fathy", "Nour Ibrahim", "Hana Mostafa", "Ali Samir"];
export const mariamId = "mariam-hassan";

export const roster: SheetEntry[] = names.map((fullName, index) => {
  const checkedIn = index === 1 || index === 3;
  return {
    annualStudentRecordId: fullName.toLowerCase().replace(" ", "-"), fullName, studentCode: null, archived: false, origin: "expected", groupName: "Group A",
    status: checkedIn ? "present" : "unknown", version: checkedIn ? 1 : 0, source: checkedIn ? "check_in" : null,
    updatedAt: checkedIn ? `2026-11-24T14:0${index}:00Z` : null, updatedBy: null, updatedByName: checkedIn ? fullName : null,
    checkedInAt: checkedIn ? `2026-11-24T14:0${index}:00Z` : null, publishedStatus: null, publishedAt: null, correctionPending: false,
  };
});

export const student = {
  id: mariamId, fullName: "Mariam Hassan", participationType: "in_person", onlineAccount: "connected",
  studentPhone: "+201012345678", parentPhone: "+201098765432",
} as StudentRecord;

type AttendanceRows = NonNullable<ComponentProps<typeof StudentAttendance>["query"]["data"]>;
const pastStatuses = ["present", "present", "late", "present", "present", "absent", "present", "present", "excused", "present", "present", "late"] as const;
/** Newest first, as the record reads them. */
export const pastAttendance: AttendanceRows = pastStatuses.map((status, index) => ({
  session_id: `past-${index}`, status, mandatory: true,
  session_started_at: new Date(Date.UTC(2026, 10, 21) - index * 3.5 * 86_400_000 + 14 * 3_600_000).toISOString(),
}));

const result = (id: string, title: string, kind: string, total: string, max: string, at: string) =>
  ({ id, title, kind, publication: { total, max_score: max, published_at: at } });
export const results: ComponentProps<typeof ResultsChart>["items"] = [
  result("a1", "Linear equations", "assignment", "14", "20", "2026-10-03T10:00:00Z"),
  result("a2", "Inequalities", "assignment", "16", "20", "2026-10-17T10:00:00Z"),
  result("a3", "Factorising", "assignment", "15.5", "20", "2026-10-31T10:00:00Z"),
  result("a4", "Quadratic equations", "assignment", "18", "20", "2026-11-14T10:00:00Z"),
  result("q1", "Algebra check-in", "quiz", "8", "10", "2026-10-24T10:00:00Z"),
];

const nile = { name: academy.name, slug: academy.slug };
export const learning: ComponentProps<typeof LearningHome>["data"] = {
  resume: [
    { id: "functions", title: "Unit 4: Functions", academy: nile, completed: 3, total: 7 },
    { id: "quadratics", title: "Unit 3: Quadratics", academy: nile, completed: 6, total: 8 },
  ],
  due: [
    { id: "quadratics", title: "Quadratic equations: practice set", academy: nile, dueAt: "2026-11-26T19:00:00Z", status: { label: "In progress", tone: "outline" } },
    { id: "graphs", title: "Sketching parabolas", academy: nile, dueAt: "2026-11-30T19:00:00Z", status: { label: "Not started", tone: "outline" } },
  ],
  upcoming: [
    { examId: "midterm", title: "Midterm: Algebra", academy: nile, action: "not_yet_open", opensAt: "2026-12-05T08:00:00Z" },
  ],
};
