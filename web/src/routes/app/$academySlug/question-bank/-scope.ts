import { notFound } from "@/lib/navigation";
import { isAcademyManager } from "@/modules/academies/roles";

type StaffResult = { status: string; academy?: { id: string; role: Parameters<typeof isAcademyManager>[0] } } | null | undefined;

/** Both question-bank pages open only for managers of the academy resolved by the staff layout. */
export function managerAcademy(result: StaffResult) {
  if (result?.status !== "ok" || !result.academy) return null;
  if (!isAcademyManager(result.academy.role)) notFound();
  return result.academy.id;
}
