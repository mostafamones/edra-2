import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/modules/auth";
import { newUuid } from "@/lib/uuid";

import {
  fetchPreviewStatus, leaveForIdentity, postPreview, PREVIEW_STATUS_KEY, previewErrorMessage, viewAsStudentRequest,
  type PreviewAction,
} from "./client";

export function usePreviewStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...PREVIEW_STATUS_KEY, user?.id ?? null],
    queryFn: ({ signal }) => fetchPreviewStatus(signal),
    enabled: Boolean(user) && process.env.NODE_ENV !== "production",
    staleTime: 30_000,
  });
}

export function usePreviewAction() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  // A ref guards against a second action dispatched before the pending state re-renders.
  const busy = useRef(false);
  /** Resolves true once the browser is leaving for the new identity. */
  const run = useCallback(async (action: PreviewAction, body: Record<string, unknown>): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    const command = action === "switch" || action === "return"
      ? { ...body, commandId: body.commandId ?? newUuid() }
      : body;
    const result = await postPreview(action, command);
    if (result.ok) {
      await leaveForIdentity(result.destination);
      return true;
    }
    busy.current = false;
    setPending(false);
    toast.error(previewErrorMessage(result.error));
    if (result.destination) {
      await leaveForIdentity(result.destination);
      return true;
    }
    void queryClient.invalidateQueries({ queryKey: PREVIEW_STATUS_KEY });
    return false;
  }, [queryClient]);
  return { pending, run };
}

export function useViewAsStudent() {
  const status = usePreviewStatus();
  const { pending, run } = usePreviewAction();
  return useCallback((recordId: string) => {
    if (!viewAsStudentRequest(status.data, recordId, "")) return undefined;
    return () => {
      if (pending) return;
      const request = viewAsStudentRequest(status.data, recordId, window.location.href);
      if (request) void run(request.action, request.body);
    };
  }, [status.data, pending, run]);
}

/**
 * After the previewed academy is deleted: switch to the newest other registered academy as its Owner, or exit
 * Developer mode when none is left. Resolves false when no preview of that academy is active or nothing worked,
 * so the caller can fall back to its own navigation. Read the status before deleting: afterwards it may fail.
 */
export function useLeaveDeletedAcademy() {
  const status = usePreviewStatus();
  const { run } = usePreviewAction();
  return useCallback(async (academySlug: string, preview = status.data) => {
    if (!preview?.available || !preview.active || preview.run.academySlug !== academySlug) return false;
    const next = (preview.academies ?? []).find((academy) => academy.id !== preview.run.id);
    if (next && await run("switch", { runId: preview.run.id, targetRunId: next.id, logicalId: "account:staff:owner",
      expectedRevision: preview.revision, returnTo: null })) return true;
    return run("exit", { runId: preview.run.id });
  }, [status.data, run]);
}
