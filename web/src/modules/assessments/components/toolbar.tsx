"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { cn } from "cn";

import { FilterPopover, type FilterField, type FilterSection } from "@/components/shared/filter-popover";
import { HeaderActions } from "@/components/shared/header-actions";
import { Segmented } from "@/components/shared/segmented";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { groupListQueryKey, loadGroups, loadStructure, structureQueryKey } from "@/modules/groups";
import { LabelFilter, type Label } from "@/modules/labels";
import { ALL, AUDIENCES, MAX_SEARCH, type AssessmentListParams } from "../params";
import type { AssessmentView } from "../view";
import { CreateAssessment } from "./create";
import { AUDIENCE_KINDS, TYPE_ICONS } from "./facts";
import { ViewOptions } from "./view-options";

const TYPE_LABELS = { assignment: "Assignments", quiz: "Quizzes", exam: "Exams" } as const;
const TYPES = ["assignment", "quiz", "exam"] as const;

type Props = {
  params: AssessmentListParams;
  onChange: (change: Partial<AssessmentListParams>) => void;
  view: AssessmentView;
  onView: (view: AssessmentView) => void;
  academyId: string;
  /** The academy's label catalog, once loaded. */
  labels: Label[] | undefined;
  /** The label manager button, for label managers only. */
  manager?: ReactNode;
};

/** Header type tabs, search and audience (URL state), view options and Create assessment. */
export function AssessmentToolbar({ params, onChange, view, onView, academyId, labels, manager }: Props) {
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
          <Segmented label="Type" value={params.type} className="h-9" hideSelectedHint onChange={(type) => onChange({ type })} options={[
            { value: ALL, label: "All" },
            ...TYPES.map((type) => ({
              value: type, hint: TYPE_LABELS[type],
              label: <><HugeiconsIcon icon={TYPE_ICONS[type]} strokeWidth={1.5} className="size-4" aria-hidden="true" /><span className={cn("grid transition-[grid-template-columns,margin-left] duration-200 ease-out motion-reduce:transition-none", params.type === type ? "ml-1.5 grid-cols-[1fr]" : "grid-cols-[0fr]")}><span className="overflow-hidden">{TYPE_LABELS[type]}</span></span></>,
            })),
          ]} />
        </div>
      </HeaderActions>
      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:items-center sm:gap-3 lg:grid-cols-3">
        <InputGroup>
          <InputGroupInput type="search" placeholder="Search assessments" aria-label="Search assessments" maxLength={MAX_SEARCH}
            value={text} onChange={(event) => setText(event.target.value)} />
          <InputGroupAddon><HugeiconsIcon icon={Search01Icon} strokeWidth={1.5} aria-hidden="true" /></InputGroupAddon>
        </InputGroup>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto lg:col-span-2">
          <FilterPopover iconOnly fields={useAudienceFields(academyId, params, onChange)} sections={labelSections(labels, params, onChange)}>
            <ViewOptions params={params} onChange={onChange} view={view} onView={onView} />
            {manager}
          </FilterPopover>
          <CreateAssessment />
        </div>
      </div>
    </div>
  );
}

/** Label selection, shown once the academy has labels (or while a label filter is still set). */
function labelSections(labels: Label[] | undefined, params: AssessmentListParams, onChange: Props["onChange"]): FilterSection[] {
  const active = params.labels.length > 0 || params.unlabeled;
  if (!active && !labels?.length) return [];
  return [{
    id: "labels", active, onReset: () => onChange({ labels: [], unlabeled: false }),
    content: <LabelFilter options={labels ?? []} labels={params.labels} unlabeled={params.unlabeled}
      onChange={(selection) => onChange({ labels: [...selection.labels].sort(), unlabeled: selection.unlabeled })} />,
  }];
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
