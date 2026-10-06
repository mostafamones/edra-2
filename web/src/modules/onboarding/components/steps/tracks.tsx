"use client";

import { newUuid } from "@/lib/uuid";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { GLOBAL_LEVELS, type AcademyDraft, type AcademyTrackDraft } from "../../academy-draft";
import { academyCreationCopy } from "../../copy/academy-creation";

export function TracksStep({ draft, update }: {
  draft: AcademyDraft;
  update: (change: Partial<AcademyDraft>) => void;
}) {
  const reduceMotion = useReducedMotion();
  const copy = academyCreationCopy.tracks;
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const originalTrackRef = useRef<{ id: string; name: string; isNew: boolean } | null>(null);

  useEffect(() => {
    if (activeTrackId) document.getElementById(`track-${activeTrackId}`)?.focus();
  }, [activeTrackId]);

  function activateTrack(track: AcademyTrackDraft) {
    if (originalTrackRef.current?.id !== track.id) {
      originalTrackRef.current = { id: track.id, name: track.name, isNew: !track.name.trim() };
    }
    setActiveTrackId(track.id);
  }

  function addTrack(levelId: AcademyTrackDraft["levelId"]) {
    let tracks = draft.tracks;
    const activeTrack = tracks.find((track) => track.id === activeTrackId);

    if (activeTrack) {
      const original = originalTrackRef.current;
      if (activeTrack.name.trim()) {
        tracks = tracks.map((track) => track.id === activeTrack.id ? { ...track, name: activeTrack.name.trim() } : track);
      } else if (original?.isNew) {
        tracks = tracks.filter((track) => track.id !== activeTrack.id);
      } else if (original) {
        tracks = tracks.map((track) => track.id === activeTrack.id ? { ...track, name: original.name } : track);
      }
    }

    const nextTrack = { id: newUuid(), levelId, name: "" };
    update({ tracks: [...tracks, nextTrack] });
    originalTrackRef.current = { id: nextTrack.id, name: "", isNew: true };
    setActiveTrackId(nextTrack.id);
  }

  function replaceTrack(id: string, replacement: AcademyTrackDraft) {
    update({ tracks: draft.tracks.map((track) => track.id === id ? replacement : track) });
  }

  function confirmTrack(track: AcademyTrackDraft) {
    const name = track.name.trim();
    if (!name) return;

    const nextTrack = { id: newUuid(), levelId: track.levelId, name: "" };
    update({
      tracks: [
        ...draft.tracks.map((item) => item.id === track.id ? { ...item, name } : item),
        nextTrack,
      ],
    });
    originalTrackRef.current = { id: nextTrack.id, name: "", isNew: true };
    setActiveTrackId(nextTrack.id);
  }

  function discardTrack(track: AcademyTrackDraft) {
    const original = originalTrackRef.current?.id === track.id ? originalTrackRef.current : null;
    if (original?.isNew || !original?.name.trim()) {
      update({ tracks: draft.tracks.filter((item) => item.id !== track.id) });
    } else if (original) {
      replaceTrack(track.id, { ...track, name: original.name });
    }
    originalTrackRef.current = null;
    setActiveTrackId(null);
  }

  function handleTrackKeyDown(event: React.KeyboardEvent<HTMLInputElement>, track: AcademyTrackDraft) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      confirmTrack(track);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      discardTrack(track);
    }
  }

  return (
    <div className="space-y-4">
      {GLOBAL_LEVELS.filter((level) => draft.levelIds.includes(level.id)).map((level) => {
        const tracks = draft.tracks.filter((track) => track.levelId === level.id);

        return (
          <section key={level.id} aria-label={copy.groupLabel(level.label)} className="overflow-hidden rounded-xl border border-border/80 bg-card">
            <div className={`flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 ${tracks.length > 0 ? "border-b border-border/70" : ""}`}>
              <h3 className="font-semibold tracking-tight">{level.label}</h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => addTrack(level.id)} className="h-9 rounded-lg px-3">
                <Plus className="size-4" />{copy.add}
              </Button>
            </div>

            {tracks.length > 0 && (
              <div className="divide-y divide-border/70">
                <AnimatePresence initial={false}>
                  {tracks.map((track, index) => (
                    <motion.div
                      key={track.id}
                      layout={!reduceMotion}
                      initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                      transition={{ duration: reduceMotion ? 0 : 0.16, ease: "easeOut" }}
                      className="flex items-center gap-3 px-3 py-2.5 sm:px-4"
                    >
                      <span aria-hidden="true" className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                      <label className="sr-only" htmlFor={`track-${track.id}`}>{copy.nameLabel(index, level.label)}</label>
                      <Input
                        id={`track-${track.id}`}
                        value={track.name}
                        onFocus={() => activateTrack(track)}
                        onKeyDown={(event) => handleTrackKeyDown(event, track)}
                        onChange={(event) => replaceTrack(track.id, { ...track, name: event.target.value })}
                        placeholder={copy.namePlaceholder}
                        maxLength={60}
                        className="h-10 min-w-0 flex-1 rounded-lg px-3"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                          aria-label={copy.remove(index, level.label)}
                        onClick={() => {
                          update({ tracks: draft.tracks.filter((item) => item.id !== track.id) });
                          if (activeTrackId === track.id) {
                            originalTrackRef.current = null;
                            setActiveTrackId(null);
                          }
                        }}
                        className="size-10 shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
