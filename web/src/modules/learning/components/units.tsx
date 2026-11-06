import type { LearningUnitsData } from "../server";
import { UNIT_STATUSES } from "../started";
import { UnitsList } from "./units-list";

export function LearningUnits({ data: { started, search, scope, view = "grid", statuses = [...UNIT_STATUSES], group = "none", groups, now, academies } }: { data: LearningUnitsData }) {
  return <UnitsList started={started} search={search} scope={scope} initialView={view} initialStatuses={statuses} initialGroup={group} groups={groups} now={now} academies={academies} />;
}
