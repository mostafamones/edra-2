"use client";

import { motion, useReducedMotion } from "framer-motion";

const reveal = { width: "auto", opacity: 1 };
const transition = { duration: 0.7, delay: 0.35, ease: "easeOut" as const };

/** Starts as "Edra", then opens into the words behind the name. */
export function BrandReveal() {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? false : { width: 0, opacity: 0 };

  return (
    <p className="text-base font-medium tracking-tight sm:text-lg">
      <span className="sr-only">A new Education Era</span>
      <span aria-hidden="true">
        <motion.span
          className="inline-block overflow-hidden whitespace-nowrap align-bottom"
          initial={initial}
          animate={reveal}
          transition={transition}
        >
          A new&nbsp;
        </motion.span>
        <span className="font-semibold text-violet-700 dark:text-violet-300">Ed</span>
        <motion.span
          className="inline-block overflow-hidden whitespace-nowrap align-bottom"
          initial={initial}
          animate={reveal}
          transition={transition}
        >
          ucation
        </motion.span>
        <motion.span
          className="inline-block overflow-hidden whitespace-nowrap align-bottom"
          initial={initial}
          animate={reveal}
          transition={transition}
        >
          &nbsp;E
        </motion.span>
        <span className="font-semibold text-violet-700 dark:text-violet-300">ra</span>
      </span>
    </p>
  );
}
