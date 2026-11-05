import { useMemo } from "react";

import { HeaderActions } from "@/components/shared/header-actions";
import { browserScopeGeneration } from "@/lib/browser-scope";
import { useAuth } from "@/modules/auth";
import { usePushSubscription } from "../push";
import { NotificationActivation } from "./activation";
import { NotificationPopover } from "./popover";

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
  // Runs on every load, not only when the popover opens: another account's subscription on this
  // browser is released (and its previews closed) as soon as this account is in use.
  const push = usePushSubscription(userId);
  return <>
    <HeaderActions><NotificationPopover scope={scope} push={push} /></HeaderActions>
    <NotificationActivation scope={scope} slug={slug} />
  </>;
}
