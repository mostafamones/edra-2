"use client";

import { motion, useReducedMotion } from "framer-motion";

import { IconCheck } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

import { GLOBAL_LEVELS, type AcademyDraft, type LevelId } from "../../academy-draft";
import { academyCreationCopy } from "../../copy/academy-creation";

export function LevelsStep({ draft, update }: {
  draft: AcademyDraft;
  update: (change: Partial<AcademyDraft>) => void;
}) {
  const reduceMotion = useReducedMotion();

  function toggleLevel(levelId: LevelId) {
    const selected = draft.levelIds.includes(levelId);
    update({
      levelIds: selected ? draft.levelIds.filter((id) => id !== levelId) : [...draft.levelIds, levelId],
      tracks: selected ? draft.tracks.filter((track) => track.levelId !== levelId) : draft.tracks,
    });
  }

  return (
    <Field>
      <FieldLabel>{academyCreationCopy.levels.question}</FieldLabel>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={academyCreationCopy.levels.groupLabel}>
        {GLOBAL_LEVELS.map((level) => {
          const selected = draft.levelIds.includes(level.id);
          return (
            <motion.div key={level.id} whileTap={reduceMotion ? undefined : { scale: 0.985 }}>
              <Button
                type="button"
                variant="outline"
                aria-pressed={selected}
                onClick={() => toggleLevel(level.id)}
                className={cn(
                  "h-16 w-full justify-between rounded-lg border-border/80 px-4 text-base font-medium",
                  selected && "border-primary bg-primary/8 text-primary ring-1 ring-primary/40"
                )}
              >
                {level.label}
                <span className={cn("grid size-5 place-items-center rounded border border-border text-xs", selected && "border-primary bg-primary text-primary-foreground")}>
                  {selected && <IconCheck className="size-3.5" aria-hidden="true" />}
                </span>
              </Button>
            </motion.div>
          );
        })}
      </div>
    </Field>
  );
}
