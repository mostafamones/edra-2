import "@tanstack/react-start/server-only";
import { cookies } from "@/lib/server/request";
import { z } from "zod";
import { redirect, notFound } from "@/lib/navigation";
import { staffEntryHref } from "@/lib/routing";
import { cookieAuthority } from "@/lib/supabase/authority";
import { isStaffAccount } from "@/modules/staff/server";
import { getStudentProfile, listMyStudentAcademies, getMyStudentAcademy } from "@/modules/students/server";
import { readLearningUnit } from "@/modules/content/server";
import { loadStudentAssignment } from "@/modules/assignments/server";
import { loadStudentExamOverview } from "@/modules/exams/server";
import { loadLearningHome, loadLearningUnits, loadLearningAssignments, loadLearningExams } from "@/modules/learning/server";
import { scopeParam, unitListParams } from "@/modules/learning";

export async function studentLayout(path: string) {
  const authority = await cookieAuthority();
  if (!authority) redirect(`/auth/login?next=${encodeURIComponent(path)}`);
  if (await isStaffAccount()) redirect(staffEntryHref());
  const { data: profile, error } = await getStudentProfile(authority.userId);
  if (error) { console.error(error); throw new Error("Could not load student profile."); }
  if (!profile?.level_id || !profile.parent_phone || !profile.parent_phone_verified_at) redirect("/onboarding/student");
  return { defaultOpen: (await cookies()).get("sidebar_state")?.value !== "false", academies: await listMyStudentAcademies() };
}
export async function studentAcademy(academySlug: string) {
  const academy = await getMyStudentAcademy(academySlug);
  if (!academy) notFound();
  return academy;
}
export async function studentAssignment({ academySlug, assignmentId }: { academySlug: string; assignmentId: string }) {
  if (!z.guid().safeParse(assignmentId).success) notFound();
  const connected = await studentAcademy(academySlug);
  if (connected.access !== "active") notFound();
  const { id, slug, name } = connected.academy;
  const academy = { id, slug, name };
  return { academy, data: await loadStudentAssignment({ academy, assignmentId }) };
}
export async function studentExam({ academySlug, examId }: { academySlug: string; examId: string }) {
  const connected = await studentAcademy(academySlug);
  const { id, slug, name } = connected.academy;
  const academy = { id, slug, name, access: connected.access };
  return { academy, data: await loadStudentExamOverview({ academy, examId }) };
}
export async function studentUnit({ academySlug, unitId }: { academySlug: string; unitId: string }) {
  if (!z.guid().safeParse(unitId).success) notFound();
  const connected = await studentAcademy(academySlug);
  if (connected.access !== "active") notFound();
  return { academyId: connected.academy.id, academySlug, ...await readLearningUnit({ academyId: connected.academy.id, unitId }) };
}
type Query = Record<string, string | string[]>;
export const studentHome = () => loadLearningHome();
export function studentAssignments(query: Query) {
  const unit = typeof query.unit === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.unit) ? query.unit : undefined;
  return loadLearningAssignments({ scope: scopeParam(query), unit });
}
export function studentExams(query: Query) { return loadLearningExams({ scope: scopeParam(query) }); }
export function studentUnits({ query, started }: { query: Query; started: boolean }) {
  return loadLearningUnits({ started, ...unitListParams(query), scope: scopeParam(query) });
}
