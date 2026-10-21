"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/modules/auth";

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
  const run = useCallback(async (action: PreviewAction, body: Record<string, unknown>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    const result = await postPreview(action, body);
    if (result.ok) {
      await leaveForIdentity(result.destination);
      return;
    }
    busy.current = false;
    setPending(false);
    toast.error(previewErrorMessage(result.error));
    if (result.destination) await leaveForIdentity(result.destination);
    else void queryClient.invalidateQueries({ queryKey: PREVIEW_STATUS_KEY });
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
