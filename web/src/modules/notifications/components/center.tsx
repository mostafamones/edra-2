import { useMemo } from "react";

import { browserScopeGeneration } from "@/lib/browser-scope";
import { useAuth } from "@/modules/auth";
import { usePushSubscription } from "../push";
import { NotificationActivation } from "./activation";

/**
 * Mount inside `ConcernPanelProvider` in the academy layout. Keyed by academy, account and browser
 * scope like the panel, so a switch drops every previous-scope state and late result.
 */
export function NotificationCenter() {
  const { activeAcademy, user } = useAuth();
  if (!activeAcademy || !user) return null;
  return <ScopedNotifications key={`${activeAcademy.id}:${user.id}:${browserScopeGeneration()}`} academyId={activeAcademy.id} slug={activeAcademy.slug} userId={user.id} />;
}

function ScopedNotifications({ academyId, slug, userId }: { academyId: string; slug: string; userId: string }) {
  const scope = useMemo(() => ({ academyId, userId }), [academyId, userId]);
  // Another account's subscription on this browser is released (and its previews closed) as soon as this account is in use.
  usePushSubscription(userId);
  return <NotificationActivation scope={scope} slug={slug} />;
}
