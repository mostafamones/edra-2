"use client";

import { IconFlagFilled, IconLoader2, IconSend } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";

import type { AnsweringSnapshot } from "../answering/controller";
import type { StudentExamQuestion } from "../types";
import { StudentExamNavigator } from "./navigator";
import { StudentExamSaveStatus } from "./save-status";
import { StudentExamTimer } from "./timer";

type Props = {
  state: AnsweringSnapshot;
  remaining: () => number | null;
  questions: StudentExamQuestion[];
  unanswered: number;
  flagged: ReadonlySet<string>;
  conflicts: ReadonlySet<string>;
  answered: (questionId: string) => boolean;
  disabled: boolean;
  submitting: boolean;
  onSelect: (questionId: string) => void;
  onSubmit: () => void;
  action?: React.ReactNode;
};

/** The exam's inset sidebar: time left, save status, progress, the question navigator and Submit. */
export function StudentExamSidebar({ state, remaining, questions, unanswered, flagged, conflicts, answered, disabled, submitting, onSelect, onSubmit, action }: Props) {
  const { setOpenMobile } = useSidebar();
  const done = questions.length - unanswered;
  const flaggedCount = questions.filter((question) => flagged.has(question.id)).length;
  // Stretch with the fixed insets, overriding the dev preview frame's offset for its bar (the exam covers it).
  return (
    <Sidebar variant="inset" className="top-0! h-auto!">
      <SidebarHeader className="gap-3 p-4">
        <h1 className="text-sm leading-snug font-semibold">{state.title}</h1>
        <StudentExamTimer remaining={remaining} className="text-3xl font-semibold [&_svg]:size-6" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="gap-3 px-4">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Answered</span>
              <span className="text-muted-foreground tabular-nums">{done} / {questions.length}</span>
            </div>
            <Progress value={questions.length ? (done / questions.length) * 100 : 0} aria-label="Answered" />
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="Left" value={unanswered} />
            <Stat label="Flagged" value={flaggedCount} icon={<IconFlagFilled className="size-3.5 text-amber-500" aria-hidden="true" />} />
          </dl>
        </SidebarGroup>
        <SidebarGroup className="px-4">
          <SidebarGroupLabel className="px-0">Questions</SidebarGroupLabel>
          <SidebarGroupContent className="pt-1">
            <StudentExamNavigator disabled={disabled} questions={questions} currentId={state.currentId} answered={answered}
              conflicts={conflicts} flagged={flagged} onSelect={(id) => { onSelect(id); setOpenMobile(false); }} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        {action}
        <StudentExamSaveStatus state={state} className="justify-center" />
        <Button className="w-full" size="lg" disabled={disabled} onClick={() => { setOpenMobile(false); onSubmit(); }}>
          {submitting ? <IconLoader2 className="animate-spin" /> : <IconSend />}Submit exam
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <dt className="flex items-center gap-1 text-muted-foreground">{icon}{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
