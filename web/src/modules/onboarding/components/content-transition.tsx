"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

import { useIsHydrated } from "./use-is-hydrated";

export function OnboardingContentTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const isHydrated = useIsHydrated();

  return (
    <motion.div
      key={pathname}
      initial={isHydrated ? { opacity: 0, x: reduceMotion ? 0 : 20 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.48, ease: "easeOut" }}
      style={{ willChange: reduceMotion ? undefined : "transform, opacity" }}
      className="flex flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
}
