import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { AssignmentsIcon, Book02Icon, CheckmarkCircle02Icon, Clock01Icon, File02Icon, LockIcon, Note01Icon, PlayIcon, SparklesIcon, Task01Icon } from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { studentAcademyPath, studentListPath } from "@/lib/routing";
import { cn } from "@/lib/utils";

import { accessLabels, learningDate, type LearningList } from "../access/types";
import { timeLeft } from "./time-left";

type Unit = LearningList["units"][number];
type Kind = Unit["contents"][number]["kind"];

const COVERS = ["bg-chart-1/15 text-chart-1", "bg-chart-2/15 text-chart-2", "bg-chart-3/15 text-chart-3", "bg-chart-4/15 text-chart-4", "bg-chart-5/15 text-chart-5"];
const NEW_FOR = 7 * 24 * 60 * 60_000;
const added = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Cairo" });

const KINDS: Record<Kind, { icon: typeof PlayIcon; label: string; one: string; many: string; tracked: boolean }> = {
  video: { icon: PlayIcon, label: "Videos", one: "video", many: "videos", tracked: true },
  document: { icon: File02Icon, label: "Files", one: "file", many: "files", tracked: false },
  assignment: { icon: AssignmentsIcon, label: "Assignments", one: "assignment", many: "assignments", tracked: true },
  quiz: { icon: Task01Icon, label: "Quizzes", one: "quiz", many: "quizzes", tracked: true },
  exam: { icon: Note01Icon, label: "Exams", one: "exam", many: "exams", tracked: true },
};
const ORDER: Kind[] = ["video", "assignment", "quiz", "exam", "document"];

/** Stable cover tint per unit, so a course keeps its colour across pages. */
function cover(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COVERS[hash % COVERS.length];
}

type Shown = ReturnType<typeof describe>;

/** Everything both layouts show, derived once from the unit and the page clock. */
function describe(unit: Unit, slug: string, now: number) {
  const { status, expiresAt } = unit.access;
  const { completed = 0, total = 0 } = unit.progress ?? {};
  const started = unit.progress?.items.some((item) => item.completed || (item.watchedSeconds ?? 0) > 0) ?? false;
  const done = total > 0 && completed === total;
  return {
    href: studentAcademyPath(slug, `units/${unit.id}`),
    assignmentsHref: unit.contents.some((entry) => entry.kind === "assignment" && entry.total > 0) ? studentListPath("assignments", slug, { unit: unit.id }) : null,
    status, expiresAt, locked: status !== "active", completed, total, started, done,
    percent: total ? Math.floor(completed / total * 100) : 0,
    fresh: !started && now - new Date(unit.publishedAt).getTime() < NEW_FOR,
    left: status === "active" && expiresAt ? timeLeft(expiresAt, now) : null,
    contents: ORDER.flatMap((kind) => unit.contents.filter((entry) => entry.kind === kind && entry.total > 0)),
    action: status === "locked" ? "Unlock" : status === "expired" ? "Renew" : status === "revoked" ? "View" : done ? "Review" : started ? "Continue" : "Start",
  };
}

/**
 * A content unit as a course: cover with status and time left, what the course contains and how much
 * of each is done, and the next step. `grid` is a card; `list` is a full-width row. `slug` scopes the
 * links; `now` keeps a page on one clock.
 */
/** Grid tracks for list rows: cover, title, progress (sm), and next step. */
export const COURSE_ROWS = "grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_9rem_auto]";

export function CourseCard({ unit, slug, academyName, now, layout = "grid" }: { unit: Unit; slug: string; academyName: string; now: number; layout?: "grid" | "list" }) {
  const shown = describe(unit, slug, now);
  const heading = (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="truncate text-xs text-muted-foreground">
        <span className="font-medium">{academyName}</span>{" · "}Added <time dateTime={unit.publishedAt}>{added.format(new Date(unit.publishedAt))}</time>
      </p>
      <Link href={shown.href} className="line-clamp-2 font-heading text-lg font-semibold leading-snug outline-none after:absolute after:inset-0">{unit.title}</Link>
    </div>
  );

  if (layout === "list") {
    // Each cell is a track of the parent list's grid (COURSE_ROWS), so columns line up across rows.
    // Optional cells still render empty to keep their place.
    return (
      <Card className="relative col-span-full grid grid-cols-subgrid items-center gap-x-3 gap-y-0 rounded-md p-3 focus-within:ring-2 focus-within:ring-ring">
        <div className={cn("relative grid size-12 place-items-center overflow-hidden rounded-md", shown.locked ? "bg-muted text-muted-foreground" : cover(unit.id))}>
          <HugeiconsIcon icon={shown.locked ? LockIcon : Book02Icon} strokeWidth={1.5} className="size-5" aria-hidden="true" />
          {/* The progress column takes over from sm up. */}
          <div className="sm:hidden"><Completion shown={shown} /></div>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <Link href={shown.href} className="min-w-0 truncate font-heading text-base font-semibold leading-snug outline-none after:absolute after:inset-0">{unit.title}</Link>
            <Flags shown={shown} />
          </div>
          <div className="relative z-10 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate font-medium">{academyName}</span>
            <Expiry shown={shown} />
          </div>
          {!shown.locked && shown.total > 0 && (
            <div className="relative z-10 sm:hidden">
              <ProgressDetails shown={shown}>
                <span className="text-xs tabular-nums text-muted-foreground">{progressText(shown)} · {shown.completed}/{shown.total}</span>
              </ProgressDetails>
            </div>
          )}
        </div>
        <div className="relative z-10 hidden sm:block">
          {!shown.locked && shown.total > 0 && (
            <ProgressDetails shown={shown}>
              <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
                <span className={cn(shown.done && "font-medium text-primary")}>{progressText(shown)}</span>
                <span>{shown.completed}/{shown.total}</span>
              </div>
              <Progress value={shown.percent} aria-label="Course completion" aria-valuetext={`${shown.completed} of ${shown.total} completed`} className="h-1.5" />
            </ProgressDetails>
          )}
        </div>
        <div className="relative z-10"><NextStep shown={shown} className="w-full" /></div>
      </Card>
    );
  }

  return (
    <Card className="relative h-full gap-0 overflow-hidden rounded-md py-0 focus-within:ring-2 focus-within:ring-ring">
      <div className={cn("relative flex h-24 items-end justify-between px-5 pb-4", shown.locked ? "bg-muted text-muted-foreground" : cover(unit.id))}>
        <HugeiconsIcon icon={shown.locked ? LockIcon : Book02Icon} strokeWidth={1.5} className="size-8" aria-hidden="true" />
        {!shown.locked && shown.total > 0 && (
          // Muted text with a background-coloured halo stays readable on any cover or thumbnail without a box.
          <span className="text-sm font-medium tabular-nums text-muted-foreground [text-shadow:0_0_6px_var(--background),0_0_2px_var(--background)]">{progressText(shown)}</span>
        )}
        <Completion shown={shown} />
        <div className="absolute left-5 top-4 flex gap-1.5"><Flags shown={shown} /></div>
        <div className="absolute right-5 top-4 z-10"><Expiry shown={shown} /></div>
      </div>
      <div className="flex flex-1 flex-col p-5">{heading}</div>
      {/* Above the stretched title link so each control receives its own clicks and hovers. */}
      <div className="relative z-10 mt-auto flex items-end justify-between gap-3 px-5 pb-5">
        <ul aria-label="Course contents" className="flex min-w-0 flex-wrap gap-1"><Contents shown={shown} /></ul>
        <div className="flex shrink-0 items-center gap-1"><AssignmentsLink shown={shown} /><NextStep shown={shown} /></div>
      </div>
    </Card>
  );
}

function ProgressDetails({ shown, children }: { shown: Shown; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div tabIndex={0} aria-label={`Course completion: ${shown.completed} of ${shown.total}. ${shown.contents.map((entry) => `${KINDS[entry.kind].label}: ${KINDS[entry.kind].tracked ? `${entry.completed} of ` : ""}${entry.total}`).join(", ")}`} className="flex flex-col gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent sideOffset={6} className="flex-wrap">
        {shown.contents.map((entry) => (
          <span key={entry.kind} className="whitespace-nowrap rounded border border-background/20 px-1.5 py-1 tabular-nums">
            {KINDS[entry.kind].label} {KINDS[entry.kind].tracked ? `${entry.completed}/${entry.total}` : entry.total}
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

function progressText(shown: Shown) {
  return shown.done ? "Completed" : shown.started ? `${shown.percent}%` : "Not started";
}

/** The cover's bottom border doubles as the completion bar. */
function Completion({ shown }: { shown: Shown }) {
  if (shown.locked || !shown.total) return null;
  return <Progress value={shown.percent} aria-label="Course completion" aria-valuetext={`${shown.completed} of ${shown.total} completed`} className="absolute inset-x-0 bottom-0 h-1 rounded-none bg-background/50" />;
}

function Flags({ shown }: { shown: Shown }) {
  if (shown.locked) return <Badge variant={shown.status === "locked" ? "secondary" : "destructive"}>{accessLabels[shown.status]}</Badge>;
  return shown.fresh ? <Badge><HugeiconsIcon icon={SparklesIcon} strokeWidth={1.5} aria-hidden="true" />New</Badge> : null;
}

function Expiry({ shown }: { shown: Shown }) {
  if (!shown.left || !shown.expiresAt) return null;
  const when = learningDate(shown.expiresAt);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" tabIndex={0} aria-label={`Expires on: ${when}`} className={cn("bg-background/90 tabular-nums", shown.left.urgent && "text-destructive")}>
          <HugeiconsIcon icon={Clock01Icon} strokeWidth={1.5} aria-hidden="true" />{shown.left.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Expires on: {when}</TooltipContent>
    </Tooltip>
  );
}

/** One badge per kind with done/total (files: a count); the tooltip names the kind. */
function Contents({ shown }: { shown: Shown }) {
  return shown.contents.map((entry) => {
    const kind = KINDS[entry.kind];
    const complete = kind.tracked && entry.completed === entry.total;
    const noun = entry.total === 1 ? kind.one : kind.many;
    return (
      <li key={entry.kind}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} aria-label={kind.tracked ? `${entry.completed} of ${entry.total} ${noun}` : `${entry.total} ${noun}`}
              className={cn("flex h-7 items-center gap-1 rounded-md border px-1.5 text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                complete ? "border-primary/30 bg-primary/5 text-primary" : "text-muted-foreground")}>
              <HugeiconsIcon icon={complete ? CheckmarkCircle02Icon : kind.icon} strokeWidth={1.5} className="size-3" aria-hidden="true" />
              {kind.tracked ? `${entry.completed}/${entry.total}` : entry.total}
            </span>
          </TooltipTrigger>
          <TooltipContent>{kind.label}</TooltipContent>
        </Tooltip>
      </li>
    );
  });
}

function AssignmentsLink({ shown }: { shown: Shown }) {
  if (!shown.assignmentsHref || shown.locked) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon-sm" variant="ghost" className="text-muted-foreground" asChild>
          <Link href={shown.assignmentsHref} aria-label="Assignments"><HugeiconsIcon icon={AssignmentsIcon} strokeWidth={1.5} aria-hidden="true" /></Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Assignments</TooltipContent>
    </Tooltip>
  );
}

function NextStep({ shown, className }: { shown: Shown; className?: string }) {
  return (
    <Button size="sm" variant={shown.locked || shown.done ? "outline" : "default"} className={className} asChild>
      <Link href={shown.href} tabIndex={-1}>{shown.action}</Link>
    </Button>
  );
}
