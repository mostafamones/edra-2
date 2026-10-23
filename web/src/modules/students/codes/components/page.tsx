"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { IconAlertCircle, IconChevronRight } from "@tabler/icons-react";

import { FILLED_INPUTS } from "@/components/shared/filled-inputs";
import { SettingsRow } from "@/components/shared/settings-row";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AcademyEntry } from "@/modules/academies";
import { cn } from "@/lib/utils";
import { useAuth } from "@/modules/auth";
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

/** Settings rows: the on/off switch, a sheet for formats and bulk generation, and a sheet for retired codes. */
export function StudentCodesRow({ academy }: { academy: AcademyEntry }) {
  const [open, setOpen] = useState(false);
  const [retiredOpen, setRetiredOpen] = useState(false);
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

  const settings = settingsQuery.data;
  return (
    <>
      <SettingsRow id="student-codes-enabled" title="Use student codes" description="Give each student a short code to identify them in attendance and records.">
        {!settings ? <Skeleton className="h-5 w-8 rounded-full" /> : canConfigure ? (
          <StudentCodesToggle
            academyId={academy.id}
            settings={settings}
            onSaved={(saved) => {
              queryClient.setQueryData(settingsKey, saved);
              void queryClient.invalidateQueries({ queryKey: [...studentsRootKey(academy.id), "list"] });
            }}
            onStale={() => { void queryClient.invalidateQueries({ queryKey: settingsKey }); }}
          />
        ) : (
          <Badge variant={settings.enabled ? "default" : "secondary"}>{settings.enabled ? "On" : "Off"}</Badge>
        )}
      </SettingsRow>
      <SettingsRow title="Code formats" description="Set code formats and generate codes in bulk.">
        {settings?.enabled ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>Manage<IconChevronRight data-icon="inline-end" /></Button>
        ) : (
          <Tooltip>
            {/* Disabled buttons don't receive pointer or focus events, so the wrapper carries the tooltip. */}
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Button type="button" variant="ghost" size="sm" disabled>Manage<IconChevronRight data-icon="inline-end" /></Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Turn on student codes to manage them.</TooltipContent>
          </Tooltip>
        )}
      </SettingsRow>
      <SettingsRow title="Retired codes" description="Codes that were replaced or removed and can’t be reused.">
        <Button type="button" variant="ghost" size="sm" onClick={() => setRetiredOpen(true)}>View<IconChevronRight data-icon="inline-end" /></Button>
      </SettingsRow>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className={cn("gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl", FILLED_INPUTS)}>
          <SheetHeader className="shrink-0 border-b px-6 py-5 pr-16">
            <SheetTitle className="text-xl">Code formats</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col divide-y overflow-y-auto [&>*]:px-6 [&>*]:py-6">
            <div>{body}</div>
            {settings && structureQuery.data && (
              <BulkStudentCodes
                academyId={academy.id}
                enabled={settings.enabled}
                settingsVersion={settings.version}
                levels={structureQuery.data.levels.map((level) => ({ levelId: level.level_id, name: structureQuery.data.levelNames[level.level_id] ?? level.level_id }))}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={retiredOpen} onOpenChange={setRetiredOpen}>
        <SheetContent side="right" className={cn("gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl", FILLED_INPUTS)}>
          <SheetHeader className="shrink-0 border-b px-6 py-5 pr-16">
            <SheetTitle className="text-xl">Retired codes</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
            {structureQuery.data ? (
              <RetiredStudentCodes academyId={academy.id} levelNames={structureQuery.data.levelNames} />
            ) : (
              <Skeleton className="h-40 w-full" />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
