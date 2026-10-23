"use client";

import { useState } from "react";
import { IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { useAcademyScope } from "@/modules/auth";

import { saveStudentCodeSettings } from "../actions";
import type { StudentCodeSettings } from "../types";

type Props = {
  academyId: string;
  settings: StudentCodeSettings;
  onSaved: (settings: StudentCodeSettings) => void;
  /** The configuration changed elsewhere; the page asks the user to reload. */
  onStale: () => void;
};

/** On/off switch that saves immediately. Formats and codes are kept either way. */
export function StudentCodesToggle({ academyId, settings, onSaved, onStale }: Props) {
  const isCurrentAcademy = useAcademyScope();
  const [saving, setSaving] = useState(false);

  async function change(next: boolean) {
    if (saving || next === settings.enabled) return;
    setSaving(true);
    try {
      const result = await saveStudentCodeSettings({
        academyId,
        expectedVersion: settings.version,
        enabled: next,
        defaultPattern: settings.defaultPattern ?? "",
        levels: settings.levels,
      });
      if (!isCurrentAcademy(academyId)) return;
      if (!result.ok) {
        if (result.code === "stale_settings") onStale();
        toast.error(result.code === "validation"
          ? "Save a format in the student code settings before turning codes on."
          : result.message);
        return;
      }
      onSaved({ ...settings, enabled: next, version: result.data.version });
      toast.success(next ? "Student codes are on." : "Student codes are off. Formats and existing codes are kept.");
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {saving && <IconLoader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />}
      <Switch id="student-codes-enabled" checked={settings.enabled} disabled={saving} onCheckedChange={(next) => void change(next)} />
    </div>
  );
}
