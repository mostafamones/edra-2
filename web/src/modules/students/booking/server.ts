import "server-only";

import { createClient } from "@/lib/supabase/server";

import { isStudentInviteToken, parseStudentJoinState, type StudentJoinState } from "../enrollment/types";
import { parseBookingForm, type BookingForm } from "./types";

/** The public form for a booking token. Works signed out; reads only. */
export async function getStudentBookingForm(token: string): Promise<BookingForm> {
  if (!isStudentInviteToken(token)) return { result: "invalid" };
  const { data, error } = await (await createClient()).rpc("get_student_booking_form", { p_token: token });
  return error ? { result: "error" } : parseBookingForm(data);
}

/** How the booking link applies to the signed-in account, from its verified identity. Never links. */
export async function previewStudentBookingEntry(token: string): Promise<StudentJoinState> {
  if (!isStudentInviteToken(token)) return { kind: "invalid" };
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims) return { kind: "unauthenticated" };
  const { data, error } = await db.rpc("preview_student_booking_entry", { p_token: token });
  return error ? { kind: "error" } : parseStudentJoinState(data);
}
