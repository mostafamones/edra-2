"use client";

import { ViewTransition, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import "./portal-transition.css";

/** Animate the entire onboarding-to-dashboard boundary, including the dashboard shell. */
export function PortalTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const stage = pathname.startsWith("/onboarding") ? "onboarding" : "portal";
  return <ViewTransition key={stage} name="academy-entry" default="none"
    share={{ "academy-join": "academy-forward", default: "none" }}
    enter={{ "academy-join": "academy-forward", default: "none" }}
    exit={{ "academy-join": "academy-forward", default: "none" }}>
    {children}
  </ViewTransition>;
}
