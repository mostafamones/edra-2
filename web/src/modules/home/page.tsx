"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AcademyGate } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { useCanonicalHref } from "@/modules/navigation";
import { homeLiveOptions } from "./queries";
import { homeOverviewOptions } from "./overview";
import { HomeView } from "./view";

export function StaffHomePage() {
  return <AcademyGate>{academy => <HomeContent key={academy.id} academy={academy} />}</AcademyGate>;
}

function HomeContent({ academy }: { academy: AcademyEntry }) {
  const href = useCanonicalHref();
  const live = useInfiniteQuery(homeLiveOptions(academy.id));
  const overview = useQuery(homeOverviewOptions(academy.id));
  return <HomeView academyName={academy.name} base={href("/app")} live={{ ...live, data: live.data?.pages.flatMap(page => page.sessions) }} overview={overview} />;
}
