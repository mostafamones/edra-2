"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconAlertCircle, IconLoader2, IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
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
  const nextLevel = GLOBAL_LEVELS.find(level => !structure?.levels.some(offered => offered.id === level.id));
  return <main className="page-shell min-w-0">
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Academic structure</h1>
        {structure?.canManage && <Button disabled={!nextLevel} onClick={() => {
          if (nextLevel) setEditing({ operation: "add_level", levelId: nextLevel.id });
        }}>
          <IconPlus aria-hidden="true" />Add level
        </Button>}
      </div>
      {query.isError && <Alert variant="destructive"><IconAlertCircle aria-hidden="true" /><AlertDescription>
        Couldn’t load the academic structure. <Button variant="outline" size="sm" disabled={query.isFetching}
          onClick={() => void query.refetch()}>Retry</Button>
      </AlertDescription></Alert>}
      {!structure && query.isPending && <StructureLoading />}
      {structure?.levels.length === 0 && <Empty><EmptyHeader><EmptyTitle>No offered levels</EmptyTitle></EmptyHeader></Empty>}
      {structure?.levels.map(level => <Card key={level.id}>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{level.name}</CardTitle><Badge variant={level.stoppedAt ? "secondary" : "outline"}>{level.stoppedAt ? "Stopped" : "Active"}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {level.tracks.filter(track => !track.retiredAt).map(track => <div key={track.id} className="flex items-center justify-between gap-3">
            <span dir="auto">{track.name}</span>
            {structure.canManage && !level.stoppedAt && <Button variant="ghost" size="sm" onClick={() => setEditing({
              operation: "rename_track", levelId: level.id as Edit["levelId"], trackId: track.id, name: track.name,
            })}>Rename<span className="sr-only"> {track.name}</span></Button>}
            {structure.canManage && structure.transitionsEnabled && !level.stoppedAt && <Button variant="ghost" size="sm"
              onClick={() => setTransition({ operation: "remove_track", levelId: level.id as Edit["levelId"], trackId: track.id })}>Remove<span className="sr-only"> {track.name}</span></Button>}
          </div>)}
          {structure.canManage && !level.stoppedAt && <Button className="self-start" variant="outline" size="sm"
            onClick={() => setEditing({ operation: "add_track", levelId: level.id as Edit["levelId"], name: "" })}>
            <IconPlus aria-hidden="true" />Add track<span className="sr-only"> to {level.name}</span>
          </Button>}
          {structure.canManage && structure.transitionsEnabled && <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setTransition({ operation: level.stoppedAt ? "resume_level" : "stop_level", levelId: level.id as Edit["levelId"] })}>
              {level.stoppedAt ? "Resume" : "Stop offering"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTransition({ operation: "remove_level", levelId: level.id as Edit["levelId"] })}>Remove level</Button>
          </div>}
        </CardContent>
      </Card>)}
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
  </main>;
}

function StructureLoading() {
  return <div role="status" aria-label="Loading academic structure" className="flex flex-col gap-4">
    <IconLoader2 className="animate-spin" aria-hidden="true" /><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" />
  </div>;
}
