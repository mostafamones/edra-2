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
          <div ref={bar} role="region" aria-label="Developer preview" className="sticky top-0 z-50 flex flex-wrap items-center gap-2 border-b bg-background px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">Viewing academy as</span>
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
                <SelectTrigger size="sm" aria-label="Preview identity" className="w-56 max-w-full">
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
                <Badge variant="secondary">Student</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void run("return", { runId: preview.run.id, expectedRevision: preview.revision })}
                >
                  <IconArrowBackUp />Return to staff
                </Button>
              </>
            )}
            {pending && <IconLoader2 className="size-4 animate-spin" aria-label="Switching" />}
            <Button size="sm" variant="ghost" className="ml-auto" disabled={pending} onClick={() => void run("exit", { runId: preview.run.id })}>
              <IconDoorExit />Exit preview
            </Button>
          </div>
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 border-2 border-primary" />
          <style>{`[data-slot=sidebar-container]{top:var(--edra-preview-bar,0px);height:calc(100svh - var(--edra-preview-bar,0px))}[data-slot=sidebar-wrapper]{min-height:calc(100svh - var(--edra-preview-bar,0px))}`}</style>
        </>
      )}
      {children}
    </>
  );
}
