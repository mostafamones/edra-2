"use client";
import { platformOrigin } from "@/lib/routing";

import { IconPencil as Pencil } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { GLOBAL_LEVELS, type AcademyDraft } from "../../academy-draft";
import { academyCreationCopy } from "../../copy/academy-creation";
import { ICONS } from "./basics";

function ReviewHeader({ title, onEdit }: { title: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <Button type="button" variant="ghost" size="sm" onClick={onEdit}><Pencil className="size-3.5" />{academyCreationCopy.review.edit}</Button>
    </div>
  );
}

export function ReviewStep({ draft, edit }: { draft: AcademyDraft; edit: (step: number) => void }) {
  const Icon = ICONS.find((item) => item.id === draft.icon)?.Icon ?? ICONS[0].Icon;
  return (
    <div className="space-y-5">
      <Card className="gap-0 rounded-lg py-0 shadow-none">
        <CardContent className="px-4 py-4">
          <ReviewHeader title={academyCreationCopy.review.academyDetails} onEdit={() => edit(1)} />
          <div className="mt-4 flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{draft.name}</p>
                <p className="truncate text-sm text-muted-foreground">{platformOrigin("staff") + "/"}<span className="font-semibold text-foreground/85">{draft.slug}</span></p>
              </div>
              <Badge variant="secondary" className="max-w-[42%] shrink-0 rounded-md">
                <span className="block truncate">{draft.subject}</span>
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 rounded-lg py-0 shadow-none">
        <CardContent className="px-4 py-4">
          <ReviewHeader title={academyCreationCopy.review.levelsAndTracks} onEdit={() => edit(3)} />
          <div className="mt-4 overflow-hidden gap-2 flex flex-col">
            {GLOBAL_LEVELS.filter((level) => draft.levelIds.includes(level.id)).map((level) => {
              const tracks = draft.tracks.filter((track) => track.levelId === level.id);
              return (
                <div
                  key={level.id}
                  className={`grid gap-2.5 px-3 py-3 sm:grid-cols-[7rem_1fr] rounded-lg border border-border/70 sm:items-center sm:px-4`}
                >
                  <p className="text-sm font-medium">{level.label}</p>
                  {tracks.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tracks.map((track) => (
                        <Badge key={track.id} variant="secondary" className="rounded-md font-medium">{track.name}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
