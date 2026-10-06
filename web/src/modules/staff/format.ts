import type { InvitationRow } from "./types";

export const ROLE_LABELS = { owner: "Owner", admin: "Admin", instructor: "Instructor" } as const;

export const STATUS_LABELS: Record<InvitationRow["status"], string> = {
  pending: "Pending",
  accepted: "Accepted",
  revoked: "Revoked",
  expired: "Expired",
};

export function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
