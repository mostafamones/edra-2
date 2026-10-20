import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { IMAGE_BUCKET, imagePath } from "@/components/shared/assessment/images/tokens";
import { cookieAuthority } from "@/lib/supabase/authority";
import type { Database } from "@/lib/supabase/database.types";
import { studentFailure, studentFailureFromDatabase } from "./errors";
import { toStudentExamImageAuthorization } from "./mapper";
import type { StudentExamCommandResult, StudentExamImagesOutcome } from "./types";

/**
 * Short-lived URLs for the question images of the caller's active attempt. The database first
 * authorizes the signed-in account, the current editor claim and each image id against the
 * authored prompt and choice text of the exam's non-excluded questions; only those ids are signed,
 * under paths built here from the authorized academy. Students have no Storage grants, so signing
 * uses the server credential, which never reaches the browser. Issued URLs stay valid for their
 * short lifetime; this is not instant revocation.
 */

export const STUDENT_IMAGE_URL_SECONDS = 60;

const input = z.object({
  academyId: z.uuid(),
  examId: z.uuid(),
  token: z.string().regex(/^[0-9a-f]{64}$/),
  imageIds: z.array(z.uuid()).min(1).max(20),
});

function storage() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })
    .storage.from(IMAGE_BUCKET);
}

export async function signMyExamImages(value: {
  academyId: string; examId: string; token: string; imageIds: string[];
}): Promise<StudentExamCommandResult<StudentExamImagesOutcome>> {
  const parsed = input.safeParse(value);
  if (!parsed.success) return studentFailure("validation");
  const { academyId, examId, token, imageIds } = parsed.data;
  const caller = await cookieAuthority();
  if (!caller) return studentFailure("forbidden");
  try {
    const { data, error } = await caller.db.rpc("authorize_my_exam_images", {
      p_academy_id: academyId, p_exam_id: examId, p_token: token, p_image_ids: [...new Set(imageIds)],
    });
    if (error) return studentFailureFromDatabase(error);
    const authorization = toStudentExamImageAuthorization(data);
    if (authorization.kind !== "ok") return { ok: true, kind: authorization.kind };
    const urls: Record<string, string> = {};
    if (authorization.imageIds.length > 0) {
      const bucket = storage();
      if (!bucket) return studentFailure("unavailable");
      const paths = authorization.imageIds.map((id) => imagePath(authorization.academyId, id));
      const signed = await bucket.createSignedUrls(paths, STUDENT_IMAGE_URL_SECONDS);
      if (signed.error) return studentFailure("unavailable");
      for (const [index, entry] of signed.data.entries()) {
        if (!entry.error && entry.signedUrl) urls[authorization.imageIds[index]] = entry.signedUrl;
      }
    }
    return { ok: true, kind: "urls", urls, expiresInSeconds: STUDENT_IMAGE_URL_SECONDS };
  } catch {
    return studentFailure("unavailable");
  }
}
