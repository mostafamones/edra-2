import { redirect } from "next/navigation";

import { studentListPath } from "@/lib/routing";

/** Earlier academy-scoped Exams links open the shared page filtered to that academy. */
export default async function AcademyExamsPage({ params, searchParams }: PageProps<"/learn/academy/[academySlug]/exams">) {
  const { academySlug } = await params;
  const query = Object.fromEntries(Object.entries(await searchParams).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[0] !== "academy"));
  redirect(studentListPath("exams", academySlug, query));
}
