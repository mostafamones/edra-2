"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "cn";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  children: ReactNode;
  /** The full value shown in the tooltip when the cell truncates it. */
  text: string;
  className?: string;
  dir?: "ltr" | "rtl" | "auto";
};

/**
 * One line of cell content that truncates to the column width. When it is cut off, hovering
 * shows the full value in a tooltip; untruncated values never show one.
 */
export function CellText({ children, text, className, dir = "auto" }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  const measure = () => {
    const element = ref.current;
    if (element) setTruncated(element.scrollWidth > element.clientWidth);
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span ref={ref} dir={dir} onPointerEnter={measure} className={cn("block min-w-0 truncate", className)}>{children}</span>
      </TooltipTrigger>
      {truncated && <TooltipContent className="max-w-sm break-words" dir={dir}>{text}</TooltipContent>}
    </Tooltip>
  );
}
