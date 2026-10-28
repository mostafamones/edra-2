import { redirect } from "next/navigation";

import { studentListPath } from "@/lib/routing";

/** Earlier academy-scoped Courses links open the shared page filtered to that academy. */
export default async function AcademyCoursesPage({ params, searchParams }: PageProps<"/learn/academy/[academySlug]/courses">) {
  const { academySlug } = await params;
  const query = Object.fromEntries(Object.entries(await searchParams).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[0] !== "academy"));
  redirect(studentListPath("courses", academySlug, query));
}
