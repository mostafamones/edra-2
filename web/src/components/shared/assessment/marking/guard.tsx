"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type DraftControl = { dirty: boolean; busy: boolean; uncertain: boolean; save: () => Promise<boolean> };
const Context = createContext<((control: DraftControl | null) => void) | null>(null);

/** The same guard covers student selection, the close button, Escape and outside dismissal. */
export function MarkingGuard({ children }: { children: (request: (action: () => void) => void) => ReactNode }) {
  const [control, setControl] = useState<DraftControl | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const register = useCallback((next: DraftControl | null) => setControl(next), []);
  const request = (action: () => void) => {
    if (control?.dirty || control?.busy || control?.uncertain) { setPending(() => action); setAsking(true); }
    else action();
  };
  const finish = () => { const action = pending; setPending(null); setAsking(false); action?.(); };
  return (
    <Context.Provider value={register}>
      {children(request)}
      <AlertDialog open={asking} onOpenChange={(open) => { if (!saving) setAsking(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this student’s marking?</AlertDialogTitle>
            <AlertDialogDescription>{control?.busy ? "A save is in progress. Wait for its result before leaving." : control?.uncertain ? "The save outcome is unknown. Retry the original save before leaving; your newer entries are kept." : "This student has unsaved entries."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Stay</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={saving || control?.busy || control?.uncertain} onClick={finish}>Discard unsaved entries</AlertDialogAction>
            <Button disabled={saving || control?.busy} onClick={async () => {
              setSaving(true);
              try { if (await control?.save()) finish(); } finally { setSaving(false); }
            }}>Save</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Context.Provider>
  );
}

export function useMarkingGuard(control: DraftControl) {
  const register = useContext(Context);
  const latest = useRef(control);
  useEffect(() => { latest.current = control; });
  const { dirty, busy, uncertain } = control;
  useEffect(() => { register?.({ dirty, busy, uncertain, save: () => latest.current.save() }); }, [register, dirty, busy, uncertain]);
  useEffect(() => () => register?.(null), [register]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (control.dirty || control.busy || control.uncertain) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [control.dirty, control.busy, control.uncertain]);
}
