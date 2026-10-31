import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { CouponsPage } from "../src/modules/content/coupons/page";
import { VersionHistory } from "../src/modules/content/components/history";
import { unitPanelOptions } from "../src/modules/content/panels";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { Button } from "../src/components/ui/button";
import { Badge } from "../src/components/ui/badge";
import { Input } from "../src/components/ui/input";
import { Field, FieldLabel } from "../src/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../src/components/ui/select";
import { Toaster } from "sonner";
import { HomeExample } from "./home";
import "../src/app/globals.css";
import "./preview.css";

const params = new URLSearchParams(location.search);
const view = params.get("view") ?? "coupons";
const state = params.get("state") ?? "ready";
const theme = params.get("theme") ?? "dark";
document.documentElement.classList.toggle("dark", theme === "dark");
const cache = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
function choose(key: string, value: string) { const next = new URL(location.href); next.searchParams.set(key, value); location.assign(next); }
function Choice({ label, value, values, field }: { label: string; value: string; values: string[]; field: string }) {
  return <Field className="w-36"><FieldLabel htmlFor={field}>{label}</FieldLabel><Select value={value} onValueChange={value => choose(field, value)}><SelectTrigger id={field}><SelectValue /></SelectTrigger><SelectContent>{values.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field>;
}
function HistoryExample() {
  const client = useQueryClient();
  const [title, setTitle] = useState("C++ Fundamentals · أساسيات البرمجة");
  useEffect(() => { void client.prefetchQuery(unitPanelOptions("preview-academy", "unit")); }, [client]);
  return <main className="page-shell"><div className="mx-auto flex w-full max-w-3xl flex-col gap-6"><div className="flex items-start justify-between gap-3"><div className="min-w-0 space-y-3"><Badge>Published</Badge><h1 dir="auto" className="break-words text-2xl font-bold">{title}</h1></div><VersionHistory academyId="preview-academy" unitId="unit" userId="preview-staff" live disabled={false} action={null} onAction={() => {}} /></div><Field><FieldLabel htmlFor="draft">Title</FieldLabel><Input id="draft" value={title} onChange={event => setTitle(event.target.value)} /></Field><Button className="self-start" variant="outline" onClick={() => void client.invalidateQueries({ queryKey: ["content", "preview-academy"] })}>Refresh history</Button></div></main>;
}
function Preview() {
  return <QueryClientProvider client={cache}><TooltipProvider>
    <header className="flex flex-wrap items-end gap-4 border-b p-4"><div className="mr-auto"><p className="font-semibold">Edra UI review</p><p className="text-sm text-muted-foreground">Synthetic data · No academy changes</p></div><Choice label="View" field="view" value={view} values={["home", "coupons", "history"]} /><Choice label="State" field="state" value={state} values={["ready", "loading", "empty", "error"]} /><Choice label="Theme" field="theme" value={theme} values={["dark", "light"]} /></header>
    <div className="flex min-h-16 items-center justify-end border-b px-4" id="header-actions" />
    <div data-testid="reference-view">{view === "home" ? <HomeExample state={state} /> : view === "coupons" ? <CouponsPage /> : <HistoryExample />}</div><Toaster />
  </TooltipProvider></QueryClientProvider>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
