import {
  AndroidIcon, AssignmentsIcon, BubbleChatIcon, Calendar03Icon, ChartLineData01Icon, CommandIcon, FileImportIcon, FolderLibraryIcon,
  Link01Icon, Message01Icon, Note01Icon, Notification01Icon, QrCodeIcon, ScanIcon, StudentsIcon, Tag01Icon, TeachingIcon,
  Ticket01Icon, UserIdVerificationIcon, LibraryIcon,
} from "@hugeicons/core-free-icons";

export type Entry = { title: string; detail: string; icon: typeof StudentsIcon; href: string; soon?: boolean };

/** What Edra does, including documented features still being built (`soon`). Shared by the menus and the page. */
export const features: Entry[] = [
  { title: "Students & records", detail: "One record per student: placement, contacts, attendance and results.", icon: StudentsIcon, href: "/#students" },
  { title: "Sessions & attendance", detail: "Start a class, check students in, finalize the register.", icon: TeachingIcon, href: "/#attendance" },
  { title: "Lessons & content", detail: "Units with videos, files and practice, released on your schedule.", icon: FolderLibraryIcon, href: "/#learning" },
  { title: "Assignments, quizzes & exams", detail: "Online or on paper, marked once and announced when ready.", icon: AssignmentsIcon, href: "/#assessments" },
  { title: "Parent reports", detail: "Attendance and results sent home as a clear report.", icon: ChartLineData01Icon, href: "/#family", soon: true },
  { title: "Messages & notes", detail: "Reach parents and keep academic notes on every student.", icon: Message01Icon, href: "/#family", soon: true },
];

export const mobile: Entry[] = [
  { title: "Scan to check in", detail: "Point the camera at a student code.", icon: QrCodeIcon, href: "/#mobile" },
  { title: "Mark paper work", detail: "Scan a student, enter marks per part.", icon: ScanIcon, href: "/#mobile" },
  { title: "Staff notifications", detail: "Know when work needs you.", icon: Notification01Icon, href: "/#mobile", soon: true },
  { title: "Concern threads", detail: "Follow up on a student as a team.", icon: BubbleChatIcon, href: "/#mobile", soon: true },
  { title: "Edra for Android", detail: "The same companion on Android.", icon: AndroidIcon, href: "/#mobile" },
];

export const tools: Entry[] = [
  { title: "Calendar & schedules", detail: "Recurring and one-off classes.", icon: Calendar03Icon, href: "/#tools" },
  { title: "Question bank", detail: "Reuse questions across assessments.", icon: LibraryIcon, href: "/#tools" },
  { title: "Coupons", detail: "Sell access with printable code sheets.", icon: Ticket01Icon, href: "/#tools" },
  { title: "Student codes", detail: "Codes and cards for fast check-in.", icon: UserIdVerificationIcon, href: "/#tools" },
  { title: "Labels", detail: "Tag students your own way.", icon: Tag01Icon, href: "/#tools" },
  { title: "Booking & invite links", detail: "Let students enroll themselves.", icon: Link01Icon, href: "/#tools" },
  { title: "Student import", detail: "Bring a whole roster from a spreadsheet.", icon: FileImportIcon, href: "/#tools" },
  { title: "Search & commands", detail: "Jump anywhere with ⌘K.", icon: CommandIcon, href: "/#tools" },
  { title: "Academic notes", detail: "Private staff notes per student.", icon: Note01Icon, href: "/#tools", soon: true },
];
