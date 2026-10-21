"use client";

import { useEffect, useState } from "react";
import { IconClock } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

const pad = (value: number) => String(value).padStart(2, "0");

/** Time left by the server clock (never the local clock), updated twice a second. */
export function StudentExamTimer({ remaining, className }: { remaining: () => number | null; className?: string }) {
  const [left, setLeft] = useState(remaining);
  useEffect(() => {
    const id = setInterval(() => setLeft(remaining()), 500);
    return () => clearInterval(id);
  }, [remaining]);
  if (left === null) return null;
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const text = hours ? `${hours}:${pad(minutes)}:${pad(seconds % 60)}` : `${pad(minutes)}:${pad(seconds % 60)}`;
  return (
    <span role="timer" aria-label="Time left" className={cn("inline-flex items-center gap-1.5 font-mono text-sm font-medium tabular-nums", seconds <= 300 && "text-destructive", className)}>
      <IconClock className="size-4" aria-hidden="true" />{text}
    </span>
  );
}
