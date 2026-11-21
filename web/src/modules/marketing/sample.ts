import type { ComponentProps } from "react";
import type { SheetEntry } from "@/modules/attendance";
import type { LearningHome } from "@/modules/learning";
import type { ResultsChart, StudentAttendance, StudentRecord, StudentsPreview } from "@/modules/students";

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

type Row = ComponentProps<typeof StudentsPreview>["rows"][number];
const levelNames = { g10: "Grade 10", g11: "Grade 11", g12: "Grade 12" };
export const studentsPage: Omit<ComponentProps<typeof StudentsPreview>, never> = {
  total: 148,
  levelNames,
  levels: [{ level_id: "g10", sort_order: 1 }, { level_id: "g11", sort_order: 2 }, { level_id: "g12", sort_order: 3 }],
  tracks: [{ id: "sci", level_id: "g11", name: "Science", sort_order: 1 }, { id: "math", level_id: "g10", name: "Mathematics", sort_order: 1 }],
  groups: [],
  catalog: [
    { id: "scholar", name: "Scholarship", color: "violet" },
    { id: "followup", name: "Follow up", color: "amber" },
    { id: "sibling", name: "Siblings", color: "teal" },
  ],
  rows: ([
    ["Mariam Hassan", "g10", "math", "Group A", "in_person", "connected", ["scholar"]],
    ["Omar Nasser", "g10", "math", "Group A", "in_person", "connected", []],
    ["Youssef Ali", "g10", "math", "Group B", "in_person", "not_connected", ["followup"]],
    ["Salma Adel", "g11", "sci", "Group A", "in_person", "connected", ["sibling"]],
    ["Karim Fathy", "g11", "sci", "Group C", "in_person", "connected", []],
    ["Nour Ibrahim", "g11", "sci", null, "online_only", "connected", []],
    ["Hana Mostafa", "g12", null, "Group A", "in_person", "suspended", ["sibling"]],
    ["Ali Samir", "g12", null, "Group B", "in_person", "connected", []],
    ["Farida Kamal", "g12", null, null, "online_only", "connected", ["scholar", "followup"]],
    ["Adam Tarek", "g10", "math", "Group B", "in_person", "not_connected", []],
  ] as const).map(([fullName, levelId, trackId, groupName, participationType, onlineAccount, labelIds], index): Row => ({
    id: `s${index}`, academyStudentProfileId: `p${index}`, fullName, levelId, levelName: levelNames[levelId], trackId,
    trackName: trackId === "sci" ? "Science" : trackId ? "Mathematics" : null, primaryGroupId: groupName, groupName,
    participationType, onlineAccount, labelIds: [...labelIds], studentPhone: `+2010${String(12345670 + index * 1317).padStart(8, "0")}`,
    parentPhone: `+2011${String(23456780 + index * 2741).padStart(8, "0")}`, archivedAt: null, createdAt: "2026-09-01T09:00:00Z",
    updatedAt: "2026-09-01T09:00:00Z", version: 1, manuallySuspended: false, suspensionRevision: 0, accountName: null,
  })),
};
