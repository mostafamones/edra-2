"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconArrowBackUp, IconDoorExit, IconLoader2 } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACADEMY_ROLE_LABELS } from "@/modules/academies";

import { onIdentityChange } from "../client";
import { usePreviewAction, usePreviewStatus } from "../use-preview";

export function DeveloperPreviewFrame({ children }: { children: ReactNode }) {
  const status = usePreviewStatus();
  const { pending, run } = usePreviewAction();
  const bar = useRef<HTMLDivElement>(null);
  const preview = status.data?.available && status.data.active ? status.data : null;
  const active = Boolean(preview);

  useEffect(() => onIdentityChange(() => window.location.reload()), []);

  useEffect(() => {
    const element = bar.current;
    if (!active || !element) return;
    const root = document.documentElement;
    const sync = () => root.style.setProperty("--edra-preview-bar", `${element.offsetHeight}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--edra-preview-bar");
    };
  }, [active]);

  return (
    <>
      {preview && (
        <>
          <div ref={bar} role="region" aria-label="Developer preview" className="sticky top-1 z-50 mx-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-t-xl border-b bg-background px-3 h-12 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <span className="hidden text-muted-foreground sm:block">Viewing academy as</span>
            <div className="flex min-w-0 items-center justify-center gap-2">
              {preview.current.kind !== "student" ? (
              <Select
                value={preview.current.logicalId ?? "original"}
                disabled={pending}
                onValueChange={(value) => {
                  if (value === "original" || value === preview.current.logicalId) return;
                  void run("switch", {
                    runId: preview.run.id, logicalId: value, expectedRevision: preview.revision, returnTo: null,
                  });
                }}
              >
                <SelectTrigger size="sm" aria-label="Preview identity" className="w-auto max-w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {preview.current.kind === "original" && <SelectItem value="original" disabled>{preview.current.displayName}</SelectItem>}
                  {preview.staffTargets.map((target) => (
                    <SelectItem key={target.logicalId} value={target.logicalId}>
                      {`${target.displayName} · ${ACADEMY_ROLE_LABELS[target.role]}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <>
                <span className="font-medium">{preview.current.displayName}</span>
              </>
            )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1">
              {pending && <IconLoader2 className="size-4 animate-spin" aria-label="Switching" />}
              {preview.current.kind === "student" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => void run("return", { runId: preview.run.id, expectedRevision: preview.revision })}
                >
                  <IconArrowBackUp />Return to staff
                </Button>
              )}
              <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:hover:bg-destructive/20" disabled={pending} onClick={() => void run("exit", { runId: preview.run.id })}>
                <IconDoorExit />Exit preview
              </Button>
            </div>
          </div>
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 rounded-md border-2 border-primary" />
          <style>{`[data-slot=sidebar-container]{top:var(--edra-preview-bar,0px);height:calc(100svh - var(--edra-preview-bar,0px))}[data-slot=sidebar-wrapper]{height:calc(100svh - var(--edra-preview-bar,0px));min-height:0}`}</style>
        </>
      )}
      {children}
    </>
  );
}
