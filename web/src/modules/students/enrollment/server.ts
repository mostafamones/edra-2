import { cookies } from "next/headers";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { PENDING_STUDENT_INVITE_COOKIE } from "./pending";
import { isStudentInviteToken, parseStudentJoinState, studentAcademySchema, type StudentAcademy, type StudentJoinState } from "./types";

export { PENDING_STUDENT_INVITE_COOKIE, pendingStudentInviteCookie } from "./pending";

export async function pendingStudentInviteToken() {
  return (await cookies()).get(PENDING_STUDENT_INVITE_COOKIE)?.value ?? null;
}

/** Read-only preview of the pending invite for the signed-in account. Never links. */
export async function getStudentJoinState(): Promise<StudentJoinState> {
  const token = await pendingStudentInviteToken();
  if (!token) return { kind: "none" };
  if (!isStudentInviteToken(token)) return { kind: "invalid" };
  const db = await createClient();
  const { data, error } = await db.rpc("preview_student_invite", { p_token: token });
  return error ? { kind: "error" } : parseStudentJoinState(data);
}

export type StudentAcademyLink = { id: string; name: string; slug: string };

/** Academies the signed-in account is connected to, for student navigation. Read once per request. */
export const listMyStudentAcademies = cache(async (): Promise<StudentAcademyLink[]> => {
  const db = await createClient();
  const { data, error } = await db.rpc("list_my_student_academies");
  if (error) throw error;
  return studentAcademySchema.shape.academy.array().parse(data);
});

/** The signed-in account's view of one connected academy, or null when not connected. */
export async function getMyStudentAcademy(slug: string): Promise<StudentAcademy | null> {
  const db = await createClient();
  const { data, error } = await db.rpc("get_my_student_academy", { p_slug: slug });
  if (error) throw error;
  return data === null ? null : studentAcademySchema.parse(data);
}
