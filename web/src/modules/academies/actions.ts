"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import { academySlugSchema } from "./slug";
import { createAcademySetupSchema } from "./validation";

export type AcademySetupResult =
  | { ok: true; academyId: string }
  | {
      ok: false;
      code:
        | "invalidSetup"
        | "sessionExpired"
        | "slugTaken"
        | "ownerLimit"
        | "duplicateTracks"
        | "invalidAcademy"
        | "incompleteProfile"
        | "saveFailed"
        | "saveUnconfirmed";
      field?: "slug";
    };

export async function checkAcademySlugAvailability(value: string) {
  const parsed = academySlugSchema.safeParse(value);
  if (!parsed.success) return { status: "invalid" as const };

  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getClaims();
    if (!auth?.claims) return { status: "unavailable" as const };

    const { data, error } = await supabase.rpc("academy_slug_is_available", {
      candidate_slug: parsed.data,
    });

    if (error || typeof data !== "boolean") return { status: "unavailable" as const };
    return { status: data ? "available" as const : "taken" as const };
  } catch {
    return { status: "unavailable" as const };
  }
}

export async function createAcademySetup(value: unknown): Promise<AcademySetupResult> {
  const parsed = createAcademySetupSchema.safeParse(value);
  if (!parsed.success) {
    const slugIssue = parsed.error.issues.find((issue) => issue.path[0] === "slug");
    return {
      ok: false,
      code: "invalidSetup",
      ...(slugIssue ? { field: "slug" as const } : {}),
    };
  }

  let academyId: string;
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getClaims();
    if (!auth?.claims) {
      return { ok: false, code: "sessionExpired" };
    }

    const { data, error } = await supabase.rpc("create_academy_setup", {
      academy_name: parsed.data.name,
      academy_slug: parsed.data.slug,
      academy_icon: parsed.data.icon,
      academy_subject: parsed.data.subject,
      selected_level_ids: parsed.data.levelIds,
      academy_tracks: parsed.data.tracks.map(({ levelId, name }) => ({ levelId, name })),
    });

    if (error) {
      if (error.message.includes("academy_slug_taken")) {
        return { ok: false, field: "slug", code: "slugTaken" };
      }
      if (error.message.includes("academy_owner_limit")) {
        return { ok: false, code: "ownerLimit" };
      }
      if (error.message.includes("duplicate_academy_track_names")) {
        return { ok: false, code: "duplicateTracks" };
      }
      if (error.message.includes("invalid_academy")) {
        return { ok: false, code: "invalidAcademy" };
      }
      console.error("Academy setup failed", { code: error.code, message: error.message });
      if (error.code === "23503" && error.message.includes("academies_created_by_fkey")) {
        return { ok: false, code: "incompleteProfile" };
      }
      return { ok: false, code: "saveFailed" };
    }

    if (typeof data !== "string") {
      console.error("Academy setup returned an unexpected result", { data });
      return { ok: false, code: "saveUnconfirmed" };
    }

    academyId = data;
  } catch (error) {
    console.error("Academy setup failed unexpectedly", error);
    return { ok: false, code: "saveFailed" };
  }

  try {
    revalidatePath("/app");
  } catch (error) {
    console.error("Academy setup cache refresh failed", error);
  }
  return { ok: true, academyId };
}
