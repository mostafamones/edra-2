"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { IconAlertCircle, IconPencil } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCanonicalHref } from "@/modules/navigation";

export type WorkspaceTab = "overview" | "students";

type Props = {
  noun: string;
  route: string;
  id: string;
  title: string;
  /** Next to the title: the state or phase badge. */
  badge: ReactNode;
  /** The row of facts under the title: audience, due date, timer. */
  meta: ReactNode;
  /** The marking sheet trigger. */
  mark?: ReactNode;
  canEdit: boolean;
  /** The lifecycle menu or dialogs of the type. */
  more?: ReactNode;
  /** Icon-only archive control, leftmost of the actions. */
  archive?: ReactNode;
  yearOpen: boolean;
  archived: boolean;
  ready: boolean;
  /** What still blocks setup, shown while the assessment is not ready. */
  setup: ReactNode;
  /** Further notices of the type, above the tabs. */
  notices?: ReactNode;
  /** The count beside the Students tab. */
  studentCount: ReactNode;
  overview: (api: { showStudents: () => void }) => ReactNode;
  students: ReactNode;
};

/**
 * The workspace every assessment shares: a header (title, state, facts, actions), the read-only and
 * setup notices, then an Overview tab and a Students tab. Types fill the slots.
 */
export function WorkspaceView(props: Props) {
  const { noun, route, id, title, badge, meta, mark, canEdit, more, archive, yearOpen, archived, ready, setup, notices, studentCount, overview, students } = props;
  const href = useCanonicalHref();
  const [view, setView] = useState<WorkspaceTab>("overview");
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-2xl font-bold tracking-tight break-words">{title}</h1>
            {badge}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">{meta}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {archive}
          {mark}
          {more}
          {canEdit && <Button asChild><Link href={href(`/app/${route}/${id}/edit`)}><IconPencil />{ready ? "Edit" : "Continue editing"}</Link></Button>}
        </div>
      </header>

      {!yearOpen && (
        <Alert>
          <IconAlertCircle />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>This {noun} belongs to a closed academic year.</AlertDescription>
        </Alert>
      )}
      {yearOpen && !archived && !ready && (
        <Alert>
          <IconAlertCircle />
          <AlertTitle>Setup isn’t finished</AlertTitle>
          <AlertDescription>{setup}</AlertDescription>
        </Alert>
      )}
      {notices}

      <Tabs value={view} onValueChange={(value) => setView(value as WorkspaceTab)} className="gap-6">
        <TabsList variant="line" className="w-full justify-start border-b pb-[5px]">
          <TabsTrigger value="overview" className="flex-none px-3">Overview</TabsTrigger>
          <TabsTrigger value="students" className="flex-none px-3">
            Students
            <span className="text-xs text-muted-foreground tabular-nums">{studentCount}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">{overview({ showStudents: () => setView("students") })}</TabsContent>
        <TabsContent value="students">{students}</TabsContent>
      </Tabs>
    </>
  );
}
