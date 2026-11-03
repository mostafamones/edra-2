import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { studentListPath } from "@/lib/routing";
import { searchRecord } from "./search";

const slug = z.string();
const query = z.record(z.string(), z.union([z.string(), z.array(z.string())]));
const publicPath = z.string().refine((s) => s.startsWith("/") && !s.startsWith("//"));
export const loadStudentLayout = createServerFn({ method: "GET" }).validator(publicPath).handler(async ({ data }) => (await import("./student.server")).studentLayout(data));
export const loadStudentAcademy = createServerFn({ method: "GET" }).validator(slug).handler(async ({ data }) => (await import("./student.server")).studentAcademy(data));
export const loadStudentAssignmentRoute = createServerFn({ method: "GET" }).validator(z.object({ academySlug: slug, assignmentId: slug })).handler(async ({ data }) => (await import("./student.server")).studentAssignment(data));
export const loadStudentExamRoute = createServerFn({ method: "GET" }).validator(z.object({ academySlug: slug, examId: slug })).handler(async ({ data }) => (await import("./student.server")).studentExam(data));
export const loadStudentUnitRoute = createServerFn({ method: "GET" }).validator(z.object({ academySlug: slug, unitId: slug })).handler(async ({ data }) => (await import("./student.server")).studentUnit(data));
export const loadStudentHome = createServerFn({ method: "GET" }).handler(async () => (await import("./student.server")).studentHome());
export const loadStudentAssignments = createServerFn({ method: "GET" }).validator(query).handler(async ({ data }) => (await import("./student.server")).studentAssignments(data));
export const loadStudentExams = createServerFn({ method: "GET" }).validator(query).handler(async ({ data }) => (await import("./student.server")).studentExams(data));
export const loadStudentUnits = createServerFn({ method: "GET" }).validator(z.object({ query, started: z.boolean() })).handler(async ({ data }) => (await import("./student.server")).studentUnits(data));

export function academyListRedirect(section: "assignments" | "courses" | "discover" | "exams", slug: string, search: string) {
  const query = Object.fromEntries(Object.entries(searchRecord(search)).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[0] !== "academy"));
  return studentListPath(section, slug, query);
}
