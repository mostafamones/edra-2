"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Step = { value: string; label: string };

/** Underline step tabs: the shadcn line variant. */
export function StepTabs({ steps, value, onChange }: { steps: readonly Step[]; value: string; onChange: (value: string) => void }) {
  return (
    <Tabs value={value} onValueChange={onChange} >
      <TabsList variant="line" className="w-full justify-start border-b">
        {steps.map((step) => <TabsTrigger key={step.value} value={step.value} className="flex-none px-4">{step.label}</TabsTrigger>)}
      </TabsList>
    </Tabs>
  );
}

/** The step content: slides in from the side of travel and fades the previous step out. */
export function StepPanel({ stepKey, direction, children }: { stepKey: string; direction: 1 | -1; children: ReactNode }) {
  const reduce = useReducedMotion();
  const offset = reduce ? 0 : 40 * direction;
  return (
    <AnimatePresence mode="wait" initial={false} custom={offset}>
      <motion.div key={stepKey} custom={offset}
        variants={{
          enter: (x: number) => ({ opacity: 0, x }),
          center: { opacity: 1, x: 0 },
          exit: (x: number) => ({ opacity: 0, x: -x / 2 }),
        }}
        initial="enter" animate="center" exit="exit" transition={{ duration: 0.22, ease: "easeOut" }}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
