"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";

import { FilterPopover, type FilterField } from "@/components/shared/filter-popover";
import { HeaderActions } from "@/components/shared/header-actions";
import { Segmented } from "@/components/shared/segmented";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { groupListQueryKey, loadGroups, loadStructure, structureQueryKey } from "@/modules/groups";
import { ALL, AUDIENCES, MAX_SEARCH, type AssessmentListParams } from "../params";
import type { AssessmentView } from "../view";
import { CreateAssessment } from "./create";
import { AUDIENCE_KINDS } from "./facts";
import { ViewOptions } from "./view-options";

const TYPE_OPTIONS = [
  { value: ALL, label: "All" }, { value: "assignment", label: "Assignments" }, { value: "quiz", label: "Quizzes" }, { value: "exam", label: "Exams" },
] as const;

type Props = {
  params: AssessmentListParams;
  onChange: (change: Partial<AssessmentListParams>) => void;
  view: AssessmentView;
  onView: (view: AssessmentView) => void;
  academyId: string;
};

/** Header type tabs, search and audience (URL state), view options and Create assessment. */
export function AssessmentToolbar({ params, onChange, view, onView, academyId }: Props) {
  const [text, setText] = useState(params.search);
  // Follow outside changes, such as Clear filters or Back.
  const [applied, setApplied] = useState(params.search);
  if (applied !== params.search) {
    setApplied(params.search);
    setText(params.search);
  }
  useEffect(() => {
    if (text === params.search) return;
    const timer = setTimeout(() => onChange({ search: text }), 250);
    return () => clearTimeout(timer);
  }, [text, params.search, onChange]);

  return (
    <div className="flex flex-col gap-3">
      <HeaderActions>
        <div className="max-w-[calc(100vw-10rem)] overflow-x-auto">
          <Segmented label="Type" value={params.type} options={[...TYPE_OPTIONS]} onChange={(type) => onChange({ type })} />
        </div>
      </HeaderActions>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-sm">
          <InputGroupInput type="search" placeholder="Search assessments" aria-label="Search assessments" maxLength={MAX_SEARCH}
            value={text} onChange={(event) => setText(event.target.value)} />
          <InputGroupAddon><HugeiconsIcon icon={Search01Icon} strokeWidth={1.5} aria-hidden="true" /></InputGroupAddon>
        </InputGroup>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <FilterPopover iconOnly fields={useAudienceFields(academyId, params, onChange)}>
            <ViewOptions params={params} onChange={onChange} view={view} onView={onView} />
          </FilterPopover>
          <CreateAssessment />
        </div>
      </div>
    </div>
  );
}

/**
 * Audience type, then Level (always), Track (program-wide, when the level has tracks) and Group
 * (group-wide, within the level). Changing a field clears the narrower ones that no longer apply.
 * The structure and group reads are the same queries the audience names use.
 */
function useAudienceFields(academyId: string, params: AssessmentListParams, onChange: Props["onChange"]): FilterField[] {
  const structure = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId) });
  const active = useQuery({ queryKey: groupListQueryKey(academyId, false), queryFn: () => loadGroups(academyId) });
  const archived = useQuery({ queryKey: groupListQueryKey(academyId, true), queryFn: () => loadGroups(academyId, { archived: true }) });
  const levelNames = structure.data?.levelNames ?? {};
  const tracks = (structure.data?.tracks ?? []).filter((track) => track.level_id === params.level);
  const groups = [...(active.data?.groups ?? []), ...(archived.data?.groups ?? [])]
    .filter((group) => params.level === null || group.level_id === params.level);

  const fields: FilterField[] = [
    {
      id: "audience", label: "Audience type", value: params.audience, defaultValue: ALL,
      options: [{ value: ALL, label: "All audiences" }, ...AUDIENCES.map((value) => ({ value, label: AUDIENCE_KINDS[value].label }))],
      onChange: (value) => onChange({ audience: value as AssessmentListParams["audience"], track: null, groupId: null }),
    },
    {
      id: "level", label: "Level", value: params.level ?? ALL, defaultValue: ALL,
      options: [{ value: ALL, label: "All levels" }, ...(structure.data?.levels ?? []).map((level) => ({ value: level.level_id, label: levelNames[level.level_id] ?? level.level_id }))],
      onChange: (value) => onChange({ level: value === ALL ? null : value, track: null, groupId: null }),
    },
  ];
  if (params.audience === "program" && tracks.length > 0) fields.push({
    id: "track", label: "Track", value: params.track ?? ALL, defaultValue: ALL,
    options: [{ value: ALL, label: "All tracks" }, ...tracks.map((track) => ({ value: track.id, label: track.name }))],
    onChange: (value) => onChange({ track: value === ALL ? null : value }),
  });
  if (params.audience === "groups") fields.push({
    id: "group", label: "Group", value: params.groupId ?? ALL, defaultValue: ALL,
    options: [{ value: ALL, label: "All groups" }, ...groups.map((group) => ({ value: group.id, label: group.archived_at ? `${group.name} (archived)` : group.name }))],
    onChange: (value) => onChange({ groupId: value === ALL ? null : value }),
  });
  return fields;
}
