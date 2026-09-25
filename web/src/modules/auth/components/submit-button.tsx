"use client";

import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AuthSubmitButton({ pending, disabled, children, className }: { pending: boolean; disabled?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <Button type="submit" className={cn("w-full h-9", className)} disabled={pending || disabled}>
      {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
      {children}
    </Button>
  );
}
