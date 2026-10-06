"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconSearch as SearchIcon, IconX as X } from "@tabler/icons-react";

import { FilterPopover, type FilterField } from "@/components/shared/filter-popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import type { Group, Level, Track } from "@/modules/groups";
import {
  DEFAULT_LIST_PARAMS, MAX_SEARCH_LENGTH, NONE, type StatusFilter, type StudentListParams,
} from "../../list-params";
import { isParticipationType, PARTICIPATION_LABELS, PARTICIPATION_TYPES } from "../../validation";

const ALL = "all";
const SEARCH_DELAY = 300;

type Props = {
  params: StudentListParams;
  onSearch: (search: string) => void;
  codesEnabled: boolean;
  /** Applies a filter change; the page resets to the first page. */
  onFiltersChange: (change: Partial<StudentListParams>) => void;
  levels: Level[];
  levelNames: Record<string, string>;
  tracks: Track[];
  groups: Group[];
  /** Icon buttons joined to the Filter button in one group. */
  children?: ReactNode;
  /** Standalone buttons after the group, such as Import and Add student. */
  actions?: ReactNode;
};

/** Search, the Filter panel, and the badges for every active filter. */
export function StudentsToolbar({ params, onSearch, codesEnabled, onFiltersChange, levels, levelNames, tracks, groups, children, actions }: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  // The typed value runs ahead of the URL until the debounce applies it.
  const [draft, setDraft] = useState<string | null>(null);
  const [appliedSearch, setAppliedSearch] = useState(params.search);
  if (appliedSearch !== params.search) {
    // The URL changed (for example a cleared filter or back navigation): drop a draft it replaced.
    setAppliedSearch(params.search);
    if (draft !== null && draft.trim() !== params.search) setDraft(null);
  }
  useEffect(() => {
    if (draft === null || draft.trim() === params.search) return;
    const timer = setTimeout(() => onSearch(draft.trim()), SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [draft, params.search, onSearch]);

  const searchValue = draft ?? params.search;
  function clearSearch() {
    setDraft("");
    onSearch("");
    searchRef.current?.focus();
  }

  const levelName = (id: string) => levelNames[id] ?? id;
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const levelTracks = params.levelId ? tracks.filter((track) => track.level_id === params.levelId) : [];
  const groupOptions = groups.filter((group) =>
    (!params.levelId || group.level_id === params.levelId)
    && (!params.track || (params.track === NONE ? group.track_id === null : group.track_id === params.track)));

  /** Keeps a group filter only while it matches the chosen level and track. */
  function compatibleGroup(levelId: string | null, track: string | null) {
    if (!params.group || params.group === NONE) return params.group;
    const group = groupById.get(params.group);
    if (!group) return null;
    if (levelId && group.level_id !== levelId) return null;
    if (track && (track === NONE ? group.track_id !== null : group.track_id !== track)) return null;
    return params.group;
  }

  const fields: FilterField[] = [
    {
      id: "status", label: "Status", value: params.status, defaultValue: "active", toggleLabel: "Show archived",
      options: [{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }, { value: "all", label: "All" }],
      onChange: (status) => onFiltersChange({ status: status as StatusFilter }),
    },
    {
      id: "level", label: "Level", value: params.levelId ?? ALL, defaultValue: ALL,
      options: [{ value: ALL, label: "All levels" }, ...levels.map((level) => ({ value: level.level_id, label: levelName(level.level_id) }))],
      onChange: (value) => {
        const levelId = value === ALL ? null : value;
        onFiltersChange({ levelId, track: null, group: compatibleGroup(levelId, null) });
      },
    },
    ...(levelTracks.length > 0 ? [{
      id: "track", label: "Track", value: params.track ?? ALL, defaultValue: ALL,
      options: [
        { value: ALL, label: "All tracks" },
        { value: NONE, label: "No track" },
        ...levelTracks.map((track) => ({ value: track.id, label: track.name })),
      ],
      onChange: (value: string) => {
        const track = value === ALL ? null : value;
        onFiltersChange({ track, group: compatibleGroup(params.levelId, track) });
      },
    }] : []),
    {
      id: "group", label: "Group", value: params.group ?? ALL, defaultValue: ALL,
      options: [
        { value: ALL, label: "All groups" },
        { value: NONE, label: "Unassigned" },
        ...groupOptions.map((group) => ({
          value: group.id,
          label: params.levelId ? group.name : `${group.name} · ${levelName(group.level_id)}`,
        })),
      ],
      onChange: (value) => onFiltersChange({ group: value === ALL ? null : value }),
    },
    {
      id: "type", label: "Student type", value: params.participationType ?? ALL, defaultValue: ALL,
      options: [{ value: ALL, label: "All types" }, ...PARTICIPATION_TYPES.map((type) => ({ value: type, label: PARTICIPATION_LABELS[type] }))],
      onChange: (value) => onFiltersChange({ participationType: isParticipationType(value) ? value : null }),
    },
  ];

  const active: { key: string; label: string; clear: () => void }[] = [];
  if (params.status !== "active") {
    active.push({ key: "status", label: params.status === "archived" ? "Archived" : "Active and archived", clear: () => onFiltersChange({ status: "active" }) });
  }
  if (params.levelId) active.push({ key: "level", label: `Level: ${levelName(params.levelId)}`, clear: () => onFiltersChange({ levelId: null, track: null }) });
  if (params.track) {
    const name = params.track === NONE ? "No track" : trackById.get(params.track)?.name ?? "Unknown track";
    active.push({ key: "track", label: `Track: ${name}`, clear: () => onFiltersChange({ track: null }) });
  }
  if (params.group) {
    const name = params.group === NONE ? "Unassigned" : groupById.get(params.group)?.name ?? "Unknown group";
    active.push({ key: "group", label: `Group: ${name}`, clear: () => onFiltersChange({ group: null }) });
  }
  if (params.participationType) {
    active.push({ key: "type", label: PARTICIPATION_LABELS[params.participationType], clear: () => onFiltersChange({ participationType: null }) });
  }

  function clearAll() {
    onFiltersChange({
      status: DEFAULT_LIST_PARAMS.status, levelId: null, track: null, group: null, participationType: null,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-sm">
          <InputGroupInput
            ref={searchRef}
            type="search"
            className="[&::-webkit-search-cancel-button]:appearance-none"
            placeholder={codesEnabled ? "Search names, phones, codes, levels, groups" : "Search names, phones, levels, groups"}
            aria-label="Search students"
            maxLength={MAX_SEARCH_LENGTH}
            value={searchValue}
            onChange={(event) => setDraft(event.target.value)}
          />
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
          {searchValue.length > 0 && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
                onClick={clearSearch}
              >
                <X className="size-3.5" aria-hidden="true" />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        <div className="flex gap-2 sm:ml-auto">
          <FilterPopover fields={fields} iconOnly>{children}</FilterPopover>
          {actions}
        </div>
      </div>
      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {active.map((filter) => (
            <Badge key={filter.key} variant="secondary" className="h-7 max-w-full gap-1 pr-1 pl-2.5 font-normal">
              <span className="truncate">{filter.label}</span>
              <Button variant="ghost" size="icon-xs" className="size-5 rounded-full" onClick={filter.clear} aria-label={`Remove filter ${filter.label}`}>
                <X />
              </Button>
            </Badge>
          ))}
          <Button variant="ghost" size="sm" className="h-7 text-muted-foreground" onClick={clearAll}>Clear all</Button>
        </div>
      )}
    </div>
  );
}
