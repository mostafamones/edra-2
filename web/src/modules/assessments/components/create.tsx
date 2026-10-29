"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCanonicalHref } from "@/modules/navigation";
import { ASSESSMENT_TYPES, TYPE_LABELS, TYPE_ROUTES } from "../types";
import { TYPE_ICONS } from "./facts";

/** Create assessment: choose a type, then continue in that type's existing create page. */
export function CreateAssessment({ size = "default" }: { size?: "default" | "sm" }) {
  const href = useCanonicalHref();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size}><HugeiconsIcon icon={Add01Icon} strokeWidth={1.5} aria-hidden="true" />Create assessment</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {ASSESSMENT_TYPES.map((type) => (
          <DropdownMenuItem key={type} asChild>
            <Link href={href(`/app/${TYPE_ROUTES[type]}/new`)} className="gap-2">
              <HugeiconsIcon icon={TYPE_ICONS[type]} strokeWidth={1.5} className="size-4" aria-hidden="true" />
              {TYPE_LABELS[type]}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
