import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

import { type Assignment, type Student, students as fixtureStudents } from "../../fixtures";
import type { Filter } from "./workspaceModel";

// Workspace state lives above the workspace tabs, so adding/removing the Scan tab or
// switching panes never drops search, filter, selection or saved fixture work.
type Workspace = {
  assignment: Assignment;
  students: Student[];
  filter: Filter;
  setFilter: (f: Filter) => void;
  search: string;
  setSearch: (s: string) => void;
  selecting: boolean;
  setSelecting: (on: boolean) => void;
  selection: ReadonlySet<string>;
  toggle: (id: string) => void;
  saveMarks: (id: string, total: string) => void;
  announce: (ids: string[]) => void;
};

const Context = createContext<Workspace | null>(null);

export function WorkspaceProvider({ assignment, children }: { assignment: Assignment; children: ReactNode }) {
  const [students, setStudents] = useState(fixtureStudents);
  const [filter, setFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");
  const [selecting, setSelectingState] = useState(false);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());

  const value = useMemo<Workspace>(() => {
    const update = (ids: string[], patch: Partial<Student>) =>
      setStudents((all) => all.map((s) => (ids.includes(s.id) ? { ...s, ...patch } : s)));
    return {
      assignment,
      students,
      filter,
      setFilter,
      search,
      setSearch,
      selecting,
      setSelecting: (on) => {
        setSelectingState(on);
        if (!on) setSelection(new Set());
      },
      selection,
      toggle: (id) =>
        setSelection((cur) => {
          const next = new Set(cur);
          if (!next.delete(id)) next.add(id);
          return next;
        }),
      saveMarks: (id, total) => update([id], { total, status: "Marked" }),
      announce: (ids) => {
        update(ids, { status: "Announced" });
        setSelectingState(false);
        setSelection(new Set());
      },
    };
  }, [assignment, students, filter, search, selecting, selection]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("useWorkspace outside WorkspaceProvider");
  return value;
}
