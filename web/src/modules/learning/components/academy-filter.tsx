"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "all";

/** Narrows a list page to one academy through `?academy=`; changing it restarts paging and drops the course filter. */
export function AcademyFilter({ academies, value }: { academies: { slug: string; name: string }[]; value?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (academies.length < 2) return null;
  const select = (next: string) => {
    const params = new URLSearchParams(searchParams);
    for (const key of ["academy", "page", "unit"]) params.delete(key);
    if (next !== ALL) params.set("academy", next);
    router.push(params.size ? `${pathname}?${params}` : pathname);
  };
  return (
    <Select value={value ?? ALL} onValueChange={select}>
      <SelectTrigger aria-label="Academy" className="w-full sm:w-56"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All academies</SelectItem>
        {academies.map((academy) => <SelectItem key={academy.slug} value={academy.slug}>{academy.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
