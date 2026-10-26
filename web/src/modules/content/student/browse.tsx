"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Books01Icon } from "@hugeicons/core-free-icons";
import { LearningProgress } from "../progress/summary";
import { studentAcademyPath } from "@/lib/routing";
import { useAuth } from "@/modules/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { loadLearningList } from "../access/actions";
import { accessLabels, learningDate, type LearningList } from "../access/types";
import { unwrapContent } from "../types";

export function LearningBrowse({ academyId, academySlug, academyName, placement, userId, initial }: { academyId: string; academySlug: string; academyName: string; placement: string; userId: string; initial: LearningList }) {
  const [search, setSearch] = useState(""), [draftSearch, setDraftSearch] = useState("");
  const [page, setPage] = useState(0);
  const { user, loading } = useAuth();
  const query = useQuery({ queryKey: ["learning", userId, academyId, "units", search, page], enabled: !loading && user?.id === userId, queryFn: async () => {
    const result = unwrapContent(await loadLearningList({ academyId, search, page }));
    if (result.userId !== userId) throw new Error("Your account changed. Reload this page.");
    return result.page;
  },
    initialData: page === 0 && search === "" ? initial : undefined, staleTime: 0 });
  if (loading) return <main className="page-shell"><Skeleton className="h-48" /></main>;
  if (user?.id !== userId) return <main className="page-shell"><p role="alert">Reload to continue with your current account.</p><Button onClick={() => window.location.reload()}>Reload</Button></main>;
  return <main className="page-shell"><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">{academyName}</h1>{placement && <Badge variant="outline">{placement}</Badge>}</div>
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setSearch(draftSearch.trim()); setPage(0); }}><Input aria-label="Search content units" maxLength={100} value={draftSearch} onChange={e => setDraftSearch(e.target.value)} /><Button type="submit" variant="outline">Search</Button>{search && <Button type="button" variant="ghost" onClick={() => { setSearch(""); setDraftSearch(""); setPage(0); }}>Clear</Button>}</form>
    {query.isPending ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0,1,2].map(i => <Skeleton key={i} className="h-40" />)}</div> : query.isError ? <div role="alert" className="space-y-3"><p>{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div> : !query.data.units.length ? <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={Books01Icon} strokeWidth={1.5} /></EmptyMedia><EmptyTitle>{search ? "No matching content units" : "No published content units"}</EmptyTitle></EmptyHeader></Empty> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{query.data.units.map(unit => <Link key={unit.id} href={studentAcademyPath(academySlug, `units/${unit.id}`)}><Card className="h-full transition-colors hover:border-primary/50"><CardHeader><Badge variant="secondary" className="w-fit">{accessLabels[unit.access.status]}</Badge><CardTitle>{unit.title}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>{unit.materialCount} materials</p><LearningProgress progress={unit.progress} />{unit.access.expiresAt && <p>Expires {learningDate(unit.access.expiresAt)}</p>}</CardContent></Card></Link>)}</div>}
    <div className="flex justify-between"><Button variant="outline" disabled={page === 0 || query.isFetching} onClick={() => setPage(p => p - 1)}>Previous</Button><Button variant="outline" disabled={!query.data?.hasMore || query.isFetching} onClick={() => setPage(p => p + 1)}>Next</Button></div>
  </main>;
}
