"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { IconAlertCircle } from "@tabler/icons-react";

import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate, useAuth } from "@/modules/auth";
import { loadStructure, structureQueryKey } from "@/modules/groups";
import { studentsRootKey } from "../../records/queries";

import { canConfigureStudentCodes } from "../permissions";
import { fetchLevelStudentCounts, fetchStudentCodeSettings, studentCodeQueryKeys } from "../queries";
import type { StudentCodeSettings } from "../types";
import { BulkStudentCodes } from "./bulk";
import { StudentCodeSettingsEditor } from "./editor";
import { RetiredStudentCodes } from "./retired";
import { StudentCodesToggle } from "./toggle";
import { StudentCodeSettingsSummary } from "./summary";

/** Manage → Student codes: activation, formats, bulk generation, and retired codes. */
export function StudentCodesPage() {
  return <AcademyGate>{(academy) => <StudentCodes academy={academy} />}</AcademyGate>;
}

function StudentCodes({ academy }: { academy: AcademyEntry }) {
  useBreadcrumbTitle("Student codes");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const settingsKey = studentCodeQueryKeys.settings(user?.id ?? "", academy.id);
  // A draft is never replaced behind the user's back: reloads are explicit.
  const settingsQuery = useQuery({
    queryKey: settingsKey,
    queryFn: ({ signal }) => fetchStudentCodeSettings(academy.id, signal),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const structureQuery = useQuery({ queryKey: structureQueryKey(academy.id), queryFn: () => loadStructure(academy.id) });
  // Counts are a hint only: a failure leaves the subtext out instead of blocking the page.
  const levelIds = structureQuery.data?.levels.map((level) => level.level_id) ?? [];
  const countsQuery = useQuery({
    queryKey: [...studentCodeQueryKeys.levelStudents(academy.id), levelIds],
    queryFn: () => fetchLevelStudentCounts(academy.id, levelIds),
    enabled: structureQuery.isSuccess,
  });
  // Bumped when the user asks to reload, so the formats editor remounts even if the formats look unchanged.
  const [reloads, setReloads] = useState(0);
  const canConfigure = canConfigureStudentCodes(academy.role);

  let body: React.ReactNode;
  if (settingsQuery.isPending || structureQuery.isPending) {
    body = (
      <Skeleton className="h-80 w-full" />
    );
  } else if (settingsQuery.isError || structureQuery.isError) {
    body = (
      <Alert variant="destructive">
        <IconAlertCircle aria-hidden="true" />
        <AlertTitle>Couldn’t load student codes</AlertTitle>
        <AlertDescription>
          Check your connection and try again.
          <Button type="button" variant="outline" size="sm" className="mt-2"
            onClick={() => { void settingsQuery.refetch(); void structureQuery.refetch(); }}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else {
    const { levels, levelNames } = structureQuery.data;
    const levelOptions = levels.map((level) => ({ levelId: level.level_id, name: levelNames[level.level_id] ?? level.level_id, students: countsQuery.data?.[level.level_id] }));
    const settings = settingsQuery.data;
    body = canConfigure ? (
      <StudentCodeSettingsEditor
        // Toggling codes on or off must not discard formats the user is still editing.
        key={`${reloads}:${JSON.stringify([settings.defaultPattern, settings.levels])}`}
        academyId={academy.id}
        settings={settings}
        levels={levelOptions}
        onSaved={(saved: StudentCodeSettings) => queryClient.setQueryData<StudentCodeSettings>(settingsKey, (current) => ({ ...saved, enabled: current?.enabled ?? saved.enabled }))}
        onReload={() => {
          setReloads((count) => count + 1);
          void queryClient.invalidateQueries({ queryKey: settingsKey });
          void queryClient.invalidateQueries({ queryKey: structureQueryKey(academy.id) });
        }}
      />
    ) : (
      <StudentCodeSettingsSummary settings={settings} levels={levelOptions} />
    );
  }

  return (
    <section className="min-w-0">
      <div className="flex w-full flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-heading text-2xl font-bold tracking-tight">Student codes</h2>
            <p className="text-sm text-muted-foreground">Optional short codes to identify students.</p>
          </div>
          {settingsQuery.data && (canConfigure ? (
            <StudentCodesToggle
              academyId={academy.id}
              settings={settingsQuery.data}
              onSaved={(saved) => {
                queryClient.setQueryData(settingsKey, saved);
                void queryClient.invalidateQueries({ queryKey: [...studentsRootKey(academy.id), "list"] });
              }}
              onStale={() => { void queryClient.invalidateQueries({ queryKey: settingsKey }); }}
            />
          ) : (
            <Badge variant={settingsQuery.data.enabled ? "default" : "secondary"}>{settingsQuery.data.enabled ? "On" : "Off"}</Badge>
          ))}
        </div>
        {body}
        {settingsQuery.data && structureQuery.data && (
          <BulkStudentCodes
            academyId={academy.id}
            enabled={settingsQuery.data.enabled}
            settingsVersion={settingsQuery.data.version}
            levels={structureQuery.data.levels.map((level) => ({ levelId: level.level_id, name: structureQuery.data.levelNames[level.level_id] ?? level.level_id }))}
          />
        )}
        {structureQuery.data && (
          <RetiredStudentCodes academyId={academy.id} levelNames={structureQuery.data.levelNames} />
        )}
      </div>
    </section>
  );
}
