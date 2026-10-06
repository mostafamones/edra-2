import { IconListNumbers } from "@tabler/icons-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

import type { StudentCodeSettings } from "../types";
import { PatternExamples } from "./examples";

type Props = {
  settings: StudentCodeSettings;
  levels: { levelId: string; name: string; students?: number }[];
};

/** Read-only effective configuration for staff who cannot configure codes. */
export function StudentCodeSettingsSummary({ settings, levels }: Props) {
  const overrides = new Map(settings.levels.map((level) => [level.levelId, level.pattern]));
  const rows = settings.enabled
    ? levels.flatMap((level) => {
      const pattern = overrides.get(level.levelId) ?? settings.defaultPattern;
      return pattern ? [{ ...level, pattern }] : [];
    })
    : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Student codes</CardTitle>
        <CardDescription>Only the academy owner or an admin can change these settings.</CardDescription>
      </CardHeader>
      {settings.enabled && (
        <CardContent>
          {rows.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><IconListNumbers aria-hidden="true" /></EmptyMedia>
                <EmptyTitle>No formats yet</EmptyTitle>
                <EmptyDescription>No level has a code format.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col divide-y">
              {rows.map((row) => (
                <li key={row.levelId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0">
                  <span className="font-medium">{row.name}</span>
                  <span className="flex items-center gap-3">
                    <PatternExamples pattern={row.pattern} compact />
                    <span className="font-mono">{row.pattern}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}
