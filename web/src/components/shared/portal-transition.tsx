import type { ReactNode } from "react";
import { usePathname } from "@/lib/navigation";
import "./portal-transition.css";

/** Animate the entire onboarding-to-dashboard boundary, including the dashboard shell. */
export function PortalTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const stage = pathname.startsWith("/onboarding") ? "onboarding" : "portal";
  return <div key={stage} data-portal-surface className="flex flex-1 flex-col">{children}</div>;
}
