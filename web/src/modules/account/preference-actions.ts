"use server";
import { cookieAuthority } from "@/lib/supabase/authority";

export async function saveTimeFormat(value: unknown) {
  if (value !== "12h" && value !== "24h") return { ok: false as const, message: "Choose a time format." };
  const authority = await cookieAuthority();
  if (!authority) return { ok: false as const, message: "Sign in again to save your preference." };
  const { data, error } = await authority.db.from("profiles").update({ time_format: value }).eq("id", authority.userId).select("time_format").maybeSingle();
  if (error || !data) return { ok: false as const, message: "Couldn’t save your time format. Try again." };
  return { ok: true as const, userId: authority.userId, format: value };
}
