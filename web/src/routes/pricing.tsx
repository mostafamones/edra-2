import { createFileRoute } from "@tanstack/react-router";

import { authHref, staffEntryHref } from "@/lib/routing";
import { MarketingPricing } from "@/modules/marketing/pricing";
import { getSignedIn } from "@/routes/-functions/shell";

export const Route = createFileRoute("/pricing")({ loader: () => getSignedIn(), component: Pricing });

function Pricing() {
  const isSignedIn = Route.useLoaderData();
  return <MarketingPricing isSignedIn={isSignedIn} primaryHref={isSignedIn ? staffEntryHref() : authHref("signup")} signInHref={authHref()} />;
}
