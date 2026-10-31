"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { PALETTE, paletteChip } from "@/lib/palette";
import { cn } from "@/lib/utils";
import type { Label } from "../types";
import { LabelBadge } from "./badge";

const HOVER_MS = 400;
const SLOP_PX = 16;

/** Parked alternative to LabelOverflow, not exported from the module. A card's labels on one line; when they don't fit, the first stays whole and the rest become squares that expand on hover or focus. */
export function LabelSquares({ labels }: { labels: readonly Label[] }) {
  const root = useRef<HTMLDivElement>(null);
  const full = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  // Labels can arrive after the first render, and nothing is mounted to measure until they do.
  const hasLabels = labels.length > 0;
  const [open, setOpen] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<string | null | undefined>(undefined);
  const pointer = useRef({ x: 0, y: 0 });
  const anchor = useRef<{ x: number; y: number } | null>(null);
  const landed = useRef<string | null | undefined>(undefined);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    pending.current = undefined;
  }, []);
  const schedule = useCallback((id: string | null) => {
    if (pending.current === id) return;
    clearTimeout(timer.current);
    pending.current = id;
    timer.current = setTimeout(() => {
      pending.current = undefined;
      anchor.current = pointer.current;
      landed.current = undefined;
      setOpen(id);
    }, HOVER_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Expanding shifts the row under a still pointer, so whatever that puts under it is held until the pointer really moves. Reaching any other square still counts.
  useEffect(() => {
    if (open === null) return;
    const onMove = (event: MouseEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      const square = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-label-square]") : null;
      const id = square && list.current?.contains(square) ? square.dataset.labelSquare! : null;
      if (anchor.current) {
        const moved = Math.hypot(event.clientX - anchor.current.x, event.clientY - anchor.current.y);
        if (moved < SLOP_PX) {
          if (moved === 0 || landed.current === undefined) landed.current = id;
          if (id === null || id === landed.current) return;
        }
        anchor.current = null;
      }
      if (id === open) cancel();
      else schedule(id);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [open, cancel, schedule]);

  useEffect(() => {
    if (!root.current || !full.current) return;
    const [available, needed] = [root.current, full.current];
    const observer = new ResizeObserver(() => setOverflowing(needed.offsetWidth > available.clientWidth));
    observer.observe(available);
    observer.observe(needed);
    return () => observer.disconnect();
  }, [hasLabels]);

  if (!hasLabels) return null;
  const [first, ...rest] = labels;
  return (
    <div ref={root} className="relative min-w-0 flex-1 basis-0">
      {/* The whole row at full width, kept out of layout, so the squares can return when it fits again. */}
      <div aria-hidden="true" className="invisible absolute h-0 w-0 overflow-hidden">
        <div ref={full} className="flex w-max gap-1">{labels.map((label) => <LabelBadge key={label.id} label={label} />)}</div>
      </div>
      {overflowing ? (
        <ul ref={list} aria-label="Labels" className="flex items-center gap-1 overflow-hidden">
          <li className="flex min-w-0"><LabelBadge label={first} /></li>
          {rest.map((label, index) => {
            const expanded = open === label.id;
            return (
              <li
                key={label.id}
                tabIndex={0}
                data-label-square={label.id}
                onMouseEnter={(event) => {
                  if (open !== null) return;
                  pointer.current = { x: event.clientX, y: event.clientY };
                  schedule(label.id);
                }}
                onMouseLeave={() => { if (open === null) cancel(); }}
                onFocus={() => { cancel(); setOpen(label.id); }}
                onBlur={() => { cancel(); setOpen(null); }}
                // Padding, not margin, makes the expanded gap: the left edge stays under the pointer.
                className={cn(
                  "relative z-10 flex h-5 shrink-0 cursor-default items-center outline-none transition-[margin,padding] duration-150",
                  index > 0 && "-ml-1.5",
                  expanded && index > 0 && "pl-1.5",
                  expanded && index < rest.length - 1 && "mr-1.5",
                )}
              >
                <Badge
                  variant="secondary"
                  className={cn("relative border-0 font-normal duration-150", expanded ? "max-w-40" : "h-3 w-3 max-w-3 rounded-[3px] px-0", paletteChip(label.color))}
                >
                  <span className="truncate">{label.name}</span>
                  {/* The card color underneath keeps the square opaque, so overlapping squares don't show through. */}
                  <span aria-hidden="true" className={cn("absolute inset-0 bg-card transition-opacity duration-150", expanded && "opacity-0")}>
                    <span className={cn("absolute inset-0", PALETTE[label.color].background)} />
                  </span>
                </Badge>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul aria-label="Labels" className="flex items-center gap-1">
          {labels.map((label) => <li key={label.id} className="flex min-w-0"><LabelBadge label={label} /></li>)}
        </ul>
      )}
    </div>
  );
}
