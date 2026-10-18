"use client";
import { staffAcademyPath } from "@/lib/routing";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconArrowLeft, IconArrowRight, IconUser } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { GroupSchedule, SeatsLeft } from "@/modules/students/enrollment/components/group-schedule";
import { FieldSeparator } from "@/components/ui/field";
import { ChoiceCards } from "@/components/shared/choice-cards";
import {
  clearStudentInvite, completeStudentInvite, previewStudentInvite, type EnrollmentProgram, type StudentJoinState,
} from "@/modules/students";

import { studentJoinCopy as copy } from "../copy/student-join";
import { OnboardingContentTransition } from "./content-transition";
import { OnboardingFooter } from "./footer";
import { OnboardingFrame } from "./frame";

const programKey = (program: EnrollmentProgram) => program.trackId ?? program.levelId;
const programName = (levelName: string | null, trackName: string | null) => [levelName, trackName].filter(Boolean).join(" · ");

const RETRY_MESSAGES: Partial<Record<StudentJoinState["kind"], string>> = {
  group_full: copy.messages.groupFull,
  invalid_choice: copy.messages.invalidChoice,
  changed: copy.messages.changed,
};

/**
 * Academy onboarding after global setup. The database decides the path: an existing current-year
 * record is confirmed; new and returning students choose a program, then optionally a group.
 * Success animates into the academy; failures stay here with a retry.
 */
export function StudentJoin({ state: initialState }: { state: StudentJoinState }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState(initialState);
  const [step, setStep] = useState<"program" | "group">("program");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [groupId, setGroupId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialState.kind === "invalid") void clearStudentInvite().catch(() => {});
  }, [initialState.kind]);

  const programs = state.kind === "enroll" ? state.programs : [];
  // The student's level is fixed, so a program is a track. Without tracks there is nothing to choose.
  const single = programs.length === 1;
  const program = single ? programs[0] : programs.find((entry) => programKey(entry) === selectedProgram) ?? null;
  const currentStep = single ? "group" : step;
  const openGroups = program?.groups.filter((group) => !group.full) ?? [];
  const fullGroups = program?.groups.filter((group) => group.full) ?? [];

  function enterAcademy(slug: string) {
    router.replace(staffAcademyPath(slug), { transitionTypes: ["academy-join"] });
  }

  async function openAcademy(slug: string) {
    setBusy(true);
    await clearStudentInvite().catch(() => {});
    enterAcademy(slug);
  }

  async function complete(choice: { trackId: string | null; groupId: string | null } | null) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    let next: StudentJoinState;
    try {
      next = await completeStudentInvite(choice);
    } catch {
      next = { kind: "error" };
    }
    // Stay busy while the portal opens so the completion cannot be submitted twice.
    if (next.kind === "connected") return enterAcademy(next.academy.slug);
    if (next.kind === "error") {
      setBusy(false);
      setMessage(copy.messages.failed);
      return;
    }
    const retry = RETRY_MESSAGES[next.kind];
    if (retry) {
      const fresh = await previewStudentInvite().catch((): StudentJoinState => ({ kind: "error" }));
      setGroupId("");
      if (fresh.kind !== "enroll" || !fresh.programs.some((entry) => programKey(entry) === selectedProgram)) setStep("program");
      setState(fresh);
      setMessage(fresh.kind === "error" ? copy.messages.failed : retry);
    } else {
      setState(next);
    }
    setBusy(false);
  }

  async function retry() {
    setBusy(true);
    setMessage(null);
    setState(await previewStudentInvite().catch((): StudentJoinState => ({ kind: "error" })));
    setBusy(false);
  }

  function enroll(withGroup: boolean) {
    if (!program) return;
    void complete({ trackId: program.trackId, groupId: withGroup && groupId ? groupId : null });
  }

  const joinLabel = busy ? copy.actions.joining : copy.actions.join;
  let body: ReactNode;
  let primary: ReactNode = null;
  let left: ReactNode = null;
  let progress = 1;

  if (state.kind === "existing") {
    body = <>
      <Heading title={<AcademyTitle prefix={copy.existing.title} name={state.academy.name} />} description={copy.existing.description} />
      <div className="mt-8 flex items-center gap-3 rounded-xl border border-primary/35 bg-primary/5 px-4 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <IconUser className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{state.student.fullName}</p>
          <p className="text-sm text-muted-foreground">
            {[programName(state.student.levelName, state.student.trackName), state.student.groupName].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
    </>;
    primary = <Button type="button" disabled={busy} onClick={() => void complete(null)}>{busy ? copy.actions.joining : copy.actions.continue}<IconArrowRight className="size-4" /></Button>;
  } else if (state.kind === "connected") {
    body = <Heading title={<AcademyTitle prefix={copy.connected.title} name={state.academy.name} />} description={copy.connected.description} />;
    primary = <Button type="button" disabled={busy} onClick={() => void openAcademy(state.academy.slug)}>{copy.actions.openAcademy}<IconArrowRight className="size-4" /></Button>;
  } else if (state.kind === "enroll" && currentStep === "program") {
    progress = 0.5;
    body = <>
      <Heading
        title={state.returning ? <AcademyTitle prefix={copy.program.returningTitle} name={state.academy.name} /> : copy.program.title}
        description={copy.program.description}
      />
      <div className="mt-8">
        <ChoiceCards name="program" label={copy.program.label} value={selectedProgram} disabled={busy}
          options={state.programs.map((entry) => ({ value: programKey(entry), title: entry.trackName ?? entry.levelName }))}
          onChange={(value) => { setSelectedProgram(value); setGroupId(""); setMessage(null); }} />
      </div>
    </>;
    primary = <Button type="button" disabled={busy || !program} onClick={() => { setMessage(null); setStep("group"); }}>{copy.actions.continue}<IconArrowRight className="size-4" /></Button>;
  } else if (state.kind === "enroll") {
    body = <>
      {program?.groups.length
        ? <Heading title={copy.group.title} description={copy.group.description} />
        : <Heading title={<AcademyTitle prefix={copy.group.noneTitle} name={state.academy.name} />} description={copy.group.noneDescription} />}
      <div className="mt-8 flex flex-col gap-5">
        {openGroups.length > 0 && (
          <>
            <ChoiceCards name="group" label={copy.group.label} value={groupId} disabled={busy}
              options={openGroups.map((group) => ({
                value: group.id,
                title: (
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="text-base font-semibold">{group.name}</span>
                    {group.seatsLeft != null && <SeatsLeft count={group.seatsLeft} />}
                  </span>
                ),
                description: group.slots.length ? <GroupSchedule slots={group.slots} /> : undefined,
              }))}
              onChange={(value) => { setGroupId(value); setMessage(null); }} />
            <FieldSeparator>{copy.group.or}</FieldSeparator>
          </>
        )}
        {program?.groups.length ? (
          <ChoiceCards name="online" label={copy.group.onlineLabel} value={groupId ? "" : "online"} disabled={busy} className="sm:grid-cols-1"
            options={[{ value: "online", title: <span className="text-base font-semibold">{copy.group.online}</span> }]}
            onChange={() => { setGroupId(""); setMessage(null); }} />
        ) : null}
        {fullGroups.length > 0 && <p className="text-sm text-muted-foreground">{copy.group.full(fullGroups.map((group) => group.name).join(", "))}</p>}
      </div>
    </>;
    if (!single) left = <Button type="button" variant="ghost" className="-ml-2" disabled={busy} onClick={() => { setMessage(null); setStep("program"); }}><IconArrowLeft className="size-4" />{copy.actions.back}</Button>;
    primary = <Button type="button" disabled={busy} onClick={() => enroll(true)}>{joinLabel}<IconArrowRight className="size-4" /></Button>;
  } else {
    const text = state.kind === "staff_help" ? copy.states[state.reason]
      : state.kind === "closed" || state.kind === "unavailable" || state.kind === "level_unavailable" || state.kind === "invalid" || state.kind === "unverified" ? copy.states[state.kind === "level_unavailable" ? "levelUnavailable" : state.kind]
        : copy.states.error;
    body = <Heading title={text.title} description={text.description} />;
    if (state.kind !== "invalid" && state.kind !== "unverified" && state.kind !== "level_unavailable") {
      primary = <Button type="button" variant={state.kind === "error" ? "default" : "outline"} disabled={busy} onClick={() => void retry()}>{copy.actions.retry}</Button>;
    }
  }

  return (
    <OnboardingFrame progress={progress} progressLabel={copy.progressLabel}>
      <div className="flex flex-1 flex-col">
        <OnboardingContentTransition>
          <div className="flex flex-1 flex-col justify-center py-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={state.kind === "enroll" ? `enroll:${currentStep}` : state.kind}
                initial={{ opacity: 0, x: reduceMotion ? 0 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: reduceMotion ? 0 : -20 }}
                transition={{ duration: reduceMotion ? 0 : 0.24, ease: "easeOut" }}
              >
                {body}
              </motion.div>
            </AnimatePresence>
            {message && <p role="status" className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">{message}</p>}
          </div>
        </OnboardingContentTransition>
        <OnboardingFooter left={left} right={primary ?? undefined} />
      </div>
    </OnboardingFrame>
  );
}

function AcademyTitle({ prefix, name }: { prefix: string; name: string }) {
  return <><span className="font-normal tracking-normal">{prefix}</span> <span className="font-semibold tracking-[-0.045em]">{name}</span></>;
}

function Heading({ title, description }: { title: ReactNode; description: string }) {
  return (
    <>
      <h1 className="text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-[2.55rem]">{title}</h1>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
    </>
  );
}
