import { allStudentItems, STAFF_ACCOUNT, STAFF_CREATE_ITEMS, STAFF_GROUPS, canViewStaffItem, type NavIcon, type StaffRole } from "../manifest";
import { publicHref, studentAcademyPath } from "@/lib/routing";
import { searchScore } from "@/lib/search";

export type CommandEntry = { title: string; href: string; group: string; icon?: NavIcon; keywords?: string; command?: "start-session" };
export function commandEntries(platform: "staff" | "student", slug: string | undefined, role: StaffRole | null): CommandEntry[] {
  if (platform === "student") return [
    ...allStudentItems().map(item => ({ title: item.label, href: publicHref(item.href), group: "Pages", icon: item.icon })),
    ...(slug ? [
      { title: "Content units", href: studentAcademyPath(slug), group: "Pages", icon: "content" as const },
      { title: "Academy assignments", href: studentAcademyPath(slug, "assignments"), group: "Pages", icon: "assignments" as const },
      { title: "Academy exams", href: studentAcademyPath(slug, "exams"), group: "Pages", icon: "exams" as const },
    ] : []),
  ];
  const pages = STAFF_GROUPS.flatMap(group => group.items.flatMap(item => [item, ...(item.children ?? [])]));
  return [
    ...(slug ? pages.filter(item => canViewStaffItem(item, role)).map(item => ({ title: item.label, href: publicHref(item.href, slug), group: "Pages", icon: item.icon })) : []),
    { title: STAFF_ACCOUNT.label, href: publicHref(STAFF_ACCOUNT.href, slug), group: "Pages", icon: STAFF_ACCOUNT.icon },
    ...(slug ? STAFF_CREATE_ITEMS.filter(item => canViewStaffItem(item, role)).map(item => ({
      title: item.label === "Assignment" ? "Create assignment" : item.label, href: publicHref(item.href, slug), group: "Actions",
      icon: item.icon,
      ...(item.href === "/app/attendance/new" ? { command: "start-session" as const, keywords: "class begin attendance schedule audience حصة بدء ابدا ابدأ حضور" } : {}),
    })) : []),
  ];
}
export function filteredCommands(entries: CommandEntry[], query: string) {
  const score = (item: CommandEntry) => searchScore(item.title, query) ?? searchScore(`${item.title} ${item.keywords ?? ""}`, query);
  return entries.filter(item => score(item) !== null).sort((a, b) => (score(b) ?? 0) - (score(a) ?? 0));
}
