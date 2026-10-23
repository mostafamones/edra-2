"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconAlertCircle, IconChevronDown, IconDots, IconLoader2, IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAcademyScope, useAuth } from "@/modules/auth";
import { GLOBAL_LEVELS } from "../../levels";
import { loadStructure } from "../actions";
import { academyStructureKey } from "../query-keys";
import type { AcademyStructure, OfferingChange } from "../validation";
import { OfferingEditor } from "./editor";
import { OfferingTransition, type OfferingTransitionChange } from "./transition";

type Edit = Extract<OfferingChange, { operation: "add_level" | "add_track" | "rename_track" }>;

export function AcademyStructurePage({ slug, initial }: { slug: string; initial: AcademyStructure | null }) {
  const { user, activeAcademy } = useAuth();
  const accountId = user?.id;
  const academyId = activeAcademy?.slug === slug ? activeAcademy.id : null;
  if (!accountId || !academyId) return <StructureLoading />;
  return <StructureView key={`${accountId}:${academyId}`} slug={slug} accountId={accountId} academyId={academyId}
    initial={initial?.accountId === accountId && initial.academyId === academyId ? initial : null} />;
}

function StructureView({ slug, accountId, academyId, initial }: {
  slug: string; accountId: string; academyId: string; initial: AcademyStructure | null;
}) {
  const client = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [editing, setEditing] = useState<Edit | null>(null);
  const [transition, setTransition] = useState<OfferingTransitionChange | null>(null);
  const query = useQuery({
    queryKey: academyStructureKey(accountId, academyId), initialData: initial ?? undefined,
    queryFn: async () => {
      const result = await loadStructure(slug);
      if (!result.ok || !result.value || result.value.accountId !== accountId || result.value.academyId !== academyId)
        throw new Error("Couldn’t load the academic structure.");
      return result.value;
    },
  });
  const structure = query.data;
  const offered = new Map(structure?.levels.map(level => [level.id, level]));
  const known = new Set<string>(GLOBAL_LEVELS.map(level => level.id));
  const stages = [
    { title: "Preparatory", levels: GLOBAL_LEVELS.filter(level => level.id.startsWith("preparatory-")) },
    { title: "Secondary", levels: GLOBAL_LEVELS.filter(level => level.id.startsWith("secondary-")) },
  ];
  // Levels outside the platform catalog can only be historical; they still show so they can be managed.
  const other = structure?.levels.filter(level => !known.has(level.id)) ?? [];
  const levelRow = (level: Level) => structure && <OfferedLevel key={level.id} level={level} canManage={structure.canManage}
    transitionsEnabled={structure.transitionsEnabled} onEdit={setEditing} onTransition={setTransition} />;
  return <section className="min-w-0">
    <div className="flex w-full flex-col gap-8">
      {query.isError && <Alert variant="destructive"><IconAlertCircle aria-hidden="true" /><AlertDescription>
        Couldn’t load the academic structure. <Button variant="outline" size="sm" disabled={query.isFetching}
          onClick={() => void query.refetch()}>Retry</Button>
      </AlertDescription></Alert>}
      {!structure && query.isPending && <StructureLoading />}
      {structure && stages.map(stage => <div key={stage.title} className="flex flex-col gap-2">
        <h2 className="text-base px-2 font-semibold text-foreground/80">{stage.title}</h2>
        {stage.levels.map(level => {
          const current = offered.get(level.id);
          if (current) return levelRow(current);
          return <div key={level.id} className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-2 text-muted-foreground">
            <span>{level.label}</span>
            {structure.canManage
              ? <Button variant="ghost" size="sm" onClick={() => setEditing({ operation: "add_level", levelId: level.id })}>
                <IconPlus aria-hidden="true" />Add<span className="sr-only"> {level.label}</span>
              </Button>
              : <span className="text-sm">Not offered</span>}
          </div>;
        })}
      </div>)}
      {other.length > 0 && <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Other</h2>
        {other.map(levelRow)}
      </div>}
      {editing && structure && <OfferingEditor key={`${editing.operation}:${editing.levelId}:${"trackId" in editing ? editing.trackId : ""}`}
        slug={slug} accountId={accountId} academyId={academyId} structure={structure} initial={editing}
        onClose={() => { if (isCurrentAcademy(academyId)) setEditing(null); }}
        onCommitted={saved => {
          client.setQueryData(academyStructureKey(accountId, academyId), saved);
          if (isCurrentAcademy(academyId)) { setEditing(null); toast.success("Academic structure saved"); }
        }} />}
      {transition && structure && <OfferingTransition key={JSON.stringify(transition)} slug={slug} accountId={accountId} academyId={academyId}
        change={transition} onClose={() => { if (isCurrentAcademy(academyId)) setTransition(null); }}
        onCommitted={saved => {
          client.setQueryData(academyStructureKey(accountId, academyId), saved);
          if (isCurrentAcademy(academyId)) { setTransition(null); toast.success("Academic structure saved"); }
        }} />}
    </div>
  </section>;
}

type Level = AcademyStructure["levels"][number];

/** A solid track chip that opens its menu; a chevron shows it is interactive. */
const CHIP = "group/chip flex h-9 max-w-full items-center gap-2 rounded-lg bg-muted/60 px-3.5 text-sm font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:bg-muted dark:bg-muted/40 dark:hover:bg-muted dark:data-[state=open]:bg-muted";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function OfferedLevel({ level, canManage, transitionsEnabled, onEdit, onTransition }: {
  level: Level; canManage: boolean; transitionsEnabled: boolean;
  onEdit: (edit: Edit) => void; onTransition: (change: OfferingTransitionChange) => void;
}) {
  const levelId = level.id as Edit["levelId"];
  const stopped = Boolean(level.stoppedAt);
  const tracks = level.tracks.filter(track => !track.retiredAt);
  const counts = [
    level.dependencies.students !== undefined && plural(level.dependencies.students, "student"),
    level.dependencies.groups !== undefined && plural(level.dependencies.groups, "group"),
  ].filter(Boolean).join(" · ");
  const editable = canManage && !stopped;
  return <div className={cn("flex flex-col gap-3 rounded-lg bg-muted/50 p-4", stopped && "opacity-70")}>
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span dir="auto" className="font-heading font-semibold">{level.name}</span>
        {counts && <span className="text-sm text-muted-foreground">{counts}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Badge variant={stopped ? "secondary" : "outline"}>{stopped ? "Stopped" : "Active"}</Badge>
        {canManage && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="-mr-1 text-muted-foreground" aria-label={`Actions for ${level.name}`}><IconDots /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!transitionsEnabled} onSelect={() => onTransition({ operation: stopped ? "resume_level" : "stop_level", levelId })}>
              {stopped ? "Resume" : "Stop offering"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={!transitionsEnabled} onSelect={() => onTransition({ operation: "remove_level", levelId })}>Remove level</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>
    </div>
    {(tracks.length > 0 || editable) && <div className="flex flex-wrap gap-2">
      {tracks.map(track => editable ? <DropdownMenu key={track.id}>
        <DropdownMenuTrigger asChild>
          <button type="button" className={CHIP} aria-label={`${track.name} track options`}>
            <span dir="auto" className="truncate">{track.name}</span>
            <IconChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/chip:rotate-180" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => onEdit({ operation: "rename_track", levelId, trackId: track.id, name: track.name })}>Rename</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" disabled={!transitionsEnabled} onSelect={() => onTransition({ operation: "remove_track", levelId, trackId: track.id })}>Remove</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu> : <span key={track.id} dir="auto" className="flex h-9 max-w-full items-center rounded-lg bg-muted/60 px-3.5 text-sm font-medium dark:bg-muted/40">{track.name}</span>)}
      {editable && <button type="button" onClick={() => onEdit({ operation: "add_track", levelId, name: "" })}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-muted-foreground/30 px-3.5 text-sm text-muted-foreground transition-colors outline-none hover:border-muted-foreground/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        <IconPlus className="size-3.5" aria-hidden="true" />Track<span className="sr-only"> for {level.name}</span>
      </button>}
    </div>}
  </div>;
}

function StructureLoading() {
  return <div role="status" aria-label="Loading academic structure" className="flex flex-col gap-4">
    <IconLoader2 className="animate-spin" aria-hidden="true" /><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" />
  </div>;
}
