import { createFileRoute } from "@tanstack/react-router";

import { authHref, staffEntryHref } from "@/lib/routing";
import { MarketingHome } from "@/modules/marketing/home";
import { getSignedIn } from "@/routes/-functions/shell";

export const Route = createFileRoute("/")({ loader: () => getSignedIn(), component: Home });

function Home() {
  const isSignedIn = Route.useLoaderData();

  return (
    <MarketingHome
      isSignedIn={isSignedIn}
      primaryHref={isSignedIn ? staffEntryHref() : authHref("signup")}
      signInHref={authHref()}
    />
  );
}
