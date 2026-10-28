"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { yearLearningSchema, type YearLearning } from "./types";

type Result = { ok: true; value: YearLearning } | { ok: false; error: "forbidden" | "year_unavailable" | "unavailable" };

async function result(call: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Result> {
  try {
    const { data, error } = await call;
    if (error) return { ok: false, error: error.message === "forbidden" || error.message === "year_unavailable" ? error.message : "unavailable" };
    return { ok: true, value: yearLearningSchema.parse(data) };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

/** The open year's student learning state; every staff role may read it. */
export async function getYearLearning(academyId: string): Promise<Result> {
  if (!z.guid().safeParse(academyId).success) return { ok: false, error: "forbidden" };
  return result((await createClient()).rpc("get_year_learning", { p_academy_id: academyId }));
}

/** Owners, Head Admins and Admins start student learning for the open year. Repeating it changes nothing. */
export async function startYearLearning(academyId: string, yearId: string): Promise<Result> {
  if (!z.guid().safeParse(academyId).success || !z.guid().safeParse(yearId).success) return { ok: false, error: "forbidden" };
  return result((await createClient()).rpc("start_year_learning", { p_academy_id: academyId, p_academic_year_id: yearId }));
}
