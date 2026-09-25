"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { IconSchool } from "@tabler/icons-react";

import { Progress } from "@/components/ui/progress";

/** The delayed loader keeps fast auth checks from flashing a full-screen overlay. */
export function AuthLoadingOverlay() {
  const [progress, setProgress] = useState(13);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(current + Math.max(2, (90 - current) / 8), 90));
    }, 250);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <motion.div
      role="status"
      aria-label="Loading your academy"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{
        opacity: 0,
        filter: "blur(4px)",
        scale: 0.98,
        transition: { duration: 0.4, delay: 0 },
      }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-50 flex min-h-screen w-screen flex-col items-center justify-center gap-4 bg-background"
    >
      <div className="flex flex-col items-center gap-2 font-medium">
        <div className="flex size-10 animate-pulse items-center justify-center rounded-md bg-primary text-primary-foreground">
          <IconSchool className="size-5" />
        </div>
        <h1 className="animate-pulse text-2xl font-semibold">Edra Academy</h1>
      </div>
      <Progress value={progress} className="h-0.5 w-[min(25rem,calc(100vw-3rem))] rounded-full bg-muted" />
    </motion.div>
  );
}
