"use client";

import { Field, FieldError } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  levels: { level_id: string }[];
  tracks: { id: string; level_id: string; name: string }[];
  levelNames: Record<string, string>;
  levelId: string;
  /** Empty means every track of the level. */
  trackId: string;
  onChange: (value: { levelId: string; trackId: string }) => void;
  disabled?: boolean;
  levelError?: string;
  trackError?: string;
  /** Prefix of the trigger ids, so the two selects stay unique on a page. */
  id: string;
};

const ALL_TRACKS = "__all__";

/** A level, then optionally one of its tracks ("All tracks" by default). The track select only appears for levels that have tracks. */
export function LevelTrackSelect({ levels, tracks, levelNames, levelId, trackId, onChange, disabled, levelError, trackError, id }: Props) {
  const levelTracks = tracks.filter((track) => track.level_id === levelId);
  return (
    <div className={`grid gap-5 ${levelTracks.length ? "sm:grid-cols-2" : ""}`}>
      <Field data-invalid={Boolean(levelError) || undefined}>
        <Select value={levelId} onValueChange={(value) => onChange({ levelId: value, trackId: "" })} disabled={disabled}>
          <SelectTrigger id={`${id}-level`} aria-label="Level" className="w-full" aria-invalid={Boolean(levelError) || undefined}>
            <SelectValue placeholder="Choose a level" />
          </SelectTrigger>
          <SelectContent>
            {levels.map((level) => <SelectItem key={level.level_id} value={level.level_id}>{levelNames[level.level_id] ?? level.level_id}</SelectItem>)}
          </SelectContent>
        </Select>
        <FieldError>{levelError}</FieldError>
      </Field>
      {levelTracks.length > 0 && (
        <Field data-invalid={Boolean(trackError) || undefined}>
          <Select value={trackId || ALL_TRACKS} onValueChange={(value) => onChange({ levelId, trackId: value === ALL_TRACKS ? "" : value })} disabled={disabled}>
            <SelectTrigger id={`${id}-track`} aria-label="Track" className="w-full" aria-invalid={Boolean(trackError) || undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TRACKS}>All tracks</SelectItem>
              {levelTracks.map((track) => <SelectItem key={track.id} value={track.id}>{track.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError>{trackError}</FieldError>
        </Field>
      )}
    </div>
  );
}
