import { listMyStudentAcademies } from "@/modules/students/server";

import { readMyUnits, readNow, type Scope } from "../data";
import type { UnitStatus } from "../started";
import { UnitsList } from "./units-list";

export async function LearningUnits({ started, search, scope, view = "grid", statuses = ["active"], group = "none" }: {
  started: boolean; search: string; scope?: Scope; view?: "grid" | "list"; statuses?: UnitStatus[]; group?: "none" | "academy" | "status";
}) {
  const [groups, now, academies] = await Promise.all([readMyUnits(scope), readNow(), listMyStudentAcademies()]);
  return <UnitsList started={started} search={search} scope={scope} initialView={view} initialStatuses={statuses} initialGroup={group} groups={groups} now={now} academies={academies} />;
}
