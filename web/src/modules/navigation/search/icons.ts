import { BookOpen01Icon, Building03Icon, Calendar03Icon, ChartHistogramIcon, CheckListIcon, File01Icon, FileEditIcon, FolderLibraryIcon, Home01Icon, Message01Icon, Notification03Icon, PlayIcon, School01Icon, Search01Icon, Settings01Icon, Ticket01Icon, UserAdd01Icon, UserCircleIcon, UserGroupIcon } from "@hugeicons/core-free-icons";
import type { NavIcon } from "../manifest";

const icons = {
  overview: Home01Icon, calendar: Calendar03Icon, schedules: Calendar03Icon, sessions: PlayIcon,
  attendance: CheckListIcon, students: UserGroupIcon, groups: UserGroupIcon, bookings: Calendar03Icon,
  review: Search01Icon, content: FolderLibraryIcon, releases: BookOpen01Icon, assignments: FileEditIcon,
  quizzes: CheckListIcon, exams: File01Icon, marking: CheckListIcon, results: ChartHistogramIcon,
  communications: Message01Icon, access: Ticket01Icon, settings: Settings01Icon, academy: Building03Icon,
  structure: School01Icon, studentCodes: Ticket01Icon, studentEnrollment: UserAdd01Icon, team: UserGroupIcon,
  notifications: Notification03Icon, integrations: Settings01Icon, account: UserCircleIcon, learning: BookOpen01Icon,
} satisfies Record<NavIcon, typeof Home01Icon>;

export function commandIcon(icon?: NavIcon) { return icon ? icons[icon] : Building03Icon; }
export function recordIcon(label: string) {
  return label === "Students" ? UserGroupIcon : label === "Content units" ? BookOpen01Icon : File01Icon;
}
