"use client";
import { Button } from "@/components/ui/button";
export default function StudentUnitError({ reset }: { reset: () => void }) { return <main className="page-shell"><p role="alert">Could not load this unit.</p><Button variant="outline" onClick={reset}>Retry</Button></main>; }
