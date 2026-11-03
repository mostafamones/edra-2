import "@tanstack/react-start/server-only";
import { notFound } from "@/lib/navigation";
import { cookieAuthority } from "@/lib/supabase/authority";
import { studentAssignmentStatus } from "./components/status";
import { getMyAssignment } from "./data";
import type { BlockedReason, StudentAssignmentAcademy } from "./types";

/** What the assignment page renders; `userId` is only present when the editor mounts, as before. */
export type StudentAssignmentData =
  | { kind: "notice"; message: string }
  | {
    kind: "assignment";
    assignment: {
      id: string; title: string; instructions: string; dueAt: string | null; required: boolean;
      status: ReturnType<typeof studentAssignmentStatus>;
      unit: { id: string; title: string } | null;
      receipt: { submittedAt: string; late: boolean } | null;
      result: { total: string; maxScore: string; feedback: string } | null;
      answerVideos: { id: string; title: string }[];
      /** Why editing is blocked, only when the page says so. */
      blockedReason: BlockedReason | null;
    };
    userId: string | null;
  };

export async function loadStudentAssignment({ academy, assignmentId }: { academy: StudentAssignmentAcademy; assignmentId: string }): Promise<StudentAssignmentData> {
  const [result, caller] = await Promise.all([getMyAssignment({ academyId: academy.id, assignmentId }), cookieAuthority()]);
  if (!result.ok) {
    if (result.code === "not_found" || result.code === "validation") notFound();
    if (result.code === "unavailable") throw new Error(result.message);
    return { kind: "notice", message: result.message };
  }
  const { id, title, instructions, dueAt, required, unit, receipt, result: score, answerVideos, blockedReason, canEdit } = result.data;
  return {
    kind: "assignment",
    assignment: {
      id, title, instructions, dueAt, required, unit, answerVideos,
      status: studentAssignmentStatus(result.data),
      receipt: receipt && { submittedAt: receipt.submittedAt, late: receipt.late },
      result: score && { total: score.total, maxScore: score.maxScore, feedback: score.feedback },
      blockedReason: blockedReason !== "submitted" && blockedReason !== "result_announced" ? blockedReason : null,
    },
    userId: canEdit ? caller?.userId ?? null : null,
  };
}
