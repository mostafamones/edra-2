import { studentAcademyPath, studentListPath, STUDENT_GLOBAL_PATHS } from "@/lib/routing";
import { findStudentItem } from "./manifest";

type Academy = { slug: string; name: string };
export type StudentCrumb = { label: string; href?: string };

/** Resolve public student paths and their internal rewrite forms to navigable breadcrumbs. */
export function studentBreadcrumbs(pathname: string, academies: readonly Academy[]): StudentCrumb[] {
  let path = pathname.replace(/\/$/, "") || "/";
  if (path === "/learn") path = "/";
  else if (path.startsWith("/learn/academy/")) path = path.slice("/learn/academy".length);
  else if (path.startsWith("/learn/")) path = path.slice("/learn".length);
  const parts = path.split("/").filter(Boolean);
  const academy = academies.find((item) => item.slug === parts[0]);
  const crumbs: StudentCrumb[] = [{ label: "Home", href: "/" }];
  if (!parts.length) return [{ label: "Home" }];
  if (academy) {
    crumbs.push({ label: academy.name, href: studentAcademyPath(academy.slug) });
    const section = parts[1];
    if (!section) return [{ label: "Home", href: "/" }, { label: academy.name }];
    if (["courses", "discover", "assignments", "exams"].includes(section)) {
      const label = findStudentItem(`/learn/${section}`)?.label ?? section;
      crumbs.push({ label, href: studentListPath(section) });
      if (parts.length > 2) crumbs.push({ label: section === "assignments" ? "Assignment" : section === "exams" ? "Exam" : "Course" });
    } else if (section === "units" && parts.length > 2) {
      crumbs.push({ label: "My courses", href: studentListPath("courses") }, { label: "Course" });
    } else {
      crumbs.push({ label: "Page" });
    }
  } else {
    const section = parts[0];
    const item = STUDENT_GLOBAL_PATHS.includes(section as typeof STUDENT_GLOBAL_PATHS[number]) ? findStudentItem(`/learn/${section}`) : undefined;
    crumbs.push({ label: item?.label ?? "Page" });
  }
  delete crumbs[crumbs.length - 1].href;
  return crumbs;
}
