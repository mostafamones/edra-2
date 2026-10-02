"use client";

import Link from "next/link";
import { Plus, SearchIcon } from "lucide-react";

import { FilterPopover } from "@/components/shared/filter-popover";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import type { Level } from "@/modules/groups";
import { ALL, type ScheduleFilters } from "../derive";

type Props = {
  filters: ScheduleFilters;
  onFiltersChange: (filters: ScheduleFilters) => void;
  archived: boolean;
  onArchivedChange: (archived: boolean) => void;
  levels: Level[];
  levelNames: Record<string, string>;
};

/** Search on the left; the Filter panel (status, level, attendance) and Create schedule on the right. */
export function SchedulesToolbar({ filters, onFiltersChange, archived, onArchivedChange, levels, levelNames }: Props) {
  const set = (change: Partial<ScheduleFilters>) => onFiltersChange({ ...filters, ...change });
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <InputGroup className="sm:max-w-sm">
        <InputGroupInput
          type="search"
          placeholder="Search schedules, groups, levels"
          aria-label="Search schedules"
          value={filters.search}
          onChange={(event) => set({ search: event.target.value })}
        />
        <InputGroupAddon><SearchIcon /></InputGroupAddon>
      </InputGroup>
      <FilterPopover fields={[
          {
            id: "status", label: "Status", value: archived ? "archived" : "active", defaultValue: "active",
            options: [{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }],
            onChange: (value) => onArchivedChange(value === "archived"),
          },
          {
            id: "level", label: "Level", value: filters.level, defaultValue: ALL,
            options: [{ value: ALL, label: "All levels" }, ...levels.map((level) => ({ value: level.level_id, label: levelNames[level.level_id] ?? level.level_id }))],
            onChange: (level) => set({ level }),
          },
          {
            id: "attendance", label: "Attendance", value: filters.attendance, defaultValue: ALL,
            options: [{ value: ALL, label: "All attendance" }, { value: "mandatory", label: "Mandatory" }, { value: "optional", label: "Optional" }],
            onChange: (attendance) => set({ attendance: attendance as ScheduleFilters["attendance"] }),
          },
        ]}>
        <Button asChild className="flex-1 sm:flex-none"><Link href="/app/schedules/new"><Plus />Create schedule</Link></Button>
      </FilterPopover>
    </div>
  );
}
