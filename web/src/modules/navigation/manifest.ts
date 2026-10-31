import { IconChartBar as BarChart3, IconBell as Bell, IconBook as BookOpen, IconBuilding as Building2, IconCalendar as CalendarDays, IconCalendarClock as CalendarClock, IconClipboardCheck as ClipboardCheck, IconClipboardList as ClipboardList, IconFilePencil as FilePenLine, IconFileText as FileText, IconSchool as GraduationCap, IconHome as House, IconId as IdCard, IconUserPlus as UserPlus, IconBooks as Library, IconListCheck as ListChecks, IconMessageCircle as MessageCircle, IconSitemap as Network, IconPlug as Plug, IconZoomCheck as SearchCheck, IconSettings as Settings, IconTicket as Ticket, IconUserCog as UserCog, IconUser as UserRound, IconUsers as Users, IconUsersGroup as UsersRound, type Icon as TablerIcon } from "@tabler/icons-react";

import type { AcademyRole } from "@/modules/academies/roles";

export const NAV_ICONS = {
  overview: House,
  calendar: CalendarDays,
  schedules: CalendarClock,
  sessions: BookOpen,
  attendance: ClipboardCheck,
  students: UsersRound,
  groups: Users,
  bookings: ClipboardList,
  review: SearchCheck,
  content: Library,
  assignments: FilePenLine,
  quizzes: ListChecks,
  exams: FileText,
  marking: ClipboardCheck,
  results: BarChart3,
  communications: MessageCircle,
  access: Ticket,
  settings: Settings,
  academy: Building2,
  structure: Network,
  studentCodes: IdCard,
  studentEnrollment: UserPlus,
  team: UserCog,
  notifications: Bell,
  integrations: Plug,
  account: UserRound,
  learning: GraduationCap,
} satisfies Record<string, TablerIcon>;

export type StaffRole = AcademyRole;

/** Ordinary academy management roles (Owner, Head Admin and Admin). */
const MANAGERS: readonly StaffRole[] = ["owner", "head_admin", "admin"];
export type NavIcon = keyof typeof NAV_ICONS;

export type PagePreview = {
  title: string;
  purpose: string;
  sections: readonly string[];
  actions?: readonly string[];
};

export type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
  preview?: PagePreview;
  roles?: readonly StaffRole[];
  children?: readonly NavItem[];
};

export type NavGroup = {
  label: string;
  items: readonly NavItem[];
};

export type StaffNavSection = {
  label: string;
  hrefs: readonly string[];
};

export const STAFF_WORKSPACE_SECTIONS: readonly (StaffNavSection & { icon: NavIcon })[] = [
  { label: "Teaching", icon: "schedules", hrefs: ["/app/schedules", "/app/attendance"] },
];

/** The Assessments list and the type-specific pages it opens; all keep the Assessments entry active. */
export const ASSESSMENT_PATHS = ["/app/assessments", "/app/assignments", "/app/quizzes", "/app/exams"] as const;

export type ManagementEntry = { label: string; href: string; also?: readonly string[] };

/** Management sidebar entries; `also` lists the pages that keep the entry active. Visibility follows each page's roles. */
export const STAFF_MANAGEMENT_NAV: readonly { label: string; items: readonly ManagementEntry[] }[] = [
  {
    label: "Academy",
    items: [
      { label: "General", href: "/app/manage/academy", also: ["/app/manage/academy/structure", "/app/manage/academy/enrollment"] },
      { label: "Team", href: "/app/manage/team" },
      { label: "Bookings", href: "/app/manage/bookings" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Coupons", href: "/app/manage/access" },
      { label: "Messages", href: "/app/manage/messages", also: ["/app/manage/notifications", "/app/manage/integrations"] },
    ],
  },
  { label: "Personal", items: [{ label: "Account", href: "/app/manage/account" }] },
];

export const STAFF_GROUPS: readonly NavGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        label: "Home",
        href: "/app",
        icon: "overview",
        preview: {
          title: "Home",
          purpose: "The daily starting point for everyone running the academy.",
          sections: [
            "Today's sessions and the next events on the academy schedule.",
            "Attendance sheets that still need recording or publication.",
            "Submissions waiting for marking and results ready to publish.",
            "Recent academic activity and parent delivery issues needing attention.",
          ],
        },
      },
      {
        label: "Calendar",
        href: "/app/calendar",
        icon: "calendar",
        preview: {
          title: "Calendar",
          purpose: "A seven-day event view of the academy's teaching schedule.",
          sections: [
            "Recurring classes, one-off revisions, and dated session occurrences on a weekly time grid.",
            "Event status, group, location, time, and linked session details.",
            "Week navigation and filters for programs, groups, and event types.",
            "A compact agenda presentation for narrow screens.",
          ],
          actions: ["Open a session or schedule from its event.", "Move to another week or return to today."],
        },
      },
    ],
  },
  {
    label: "Teaching",
    items: [
      {
        label: "Schedules",
        href: "/app/schedules",
        icon: "schedules",
      },
      {
        label: "Attendance",
        href: "/app/attendance",
        icon: "sessions",
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        label: "Students",
        href: "/app/students",
        icon: "students",
      },
      {
        label: "Groups",
        // Groups live in a panel on the Students page.
        href: "/app/students?groups=open",
        icon: "groups",
      },
      {
        label: "Bookings",
        href: "/app/manage/bookings",
        icon: "bookings",
      },
    ],
  },
  {
    label: "Learning",
    items: [
      {
        label: "Library",
        href: "/app/content",
        icon: "content",
        preview: {
          title: "Library",
          purpose: "Prepare reusable teaching material before it is released to students.",
          sections: [
            "Content units indexed by level, track, subject, and preparation state.",
            "Explanation videos, attachments, and provider processing status.",
            "Draft assets and links to releases that reuse each unit.",
          ],
          actions: ["Staff can prepare drafts; library organization and archiving follow role permissions."],
        },
      },
      {
        label: "Assessments",
        href: "/app/assessments",
        icon: "assignments",
      },
      {
        label: "Marking queue",
        href: "/app/marking",
        icon: "marking",
        preview: {
          title: "Marking queue",
          purpose: "Work through submissions that need a human review or score.",
          sections: [
            "Pending written answers, physical submissions, and bubble-sheet reviews.",
            "Draft question and part marks, excused marks, and feedback.",
            "Completion checks before publishing an individual result.",
          ],
          actions: ["Review, mark, save drafts, and publish complete results."],
        },
      },
      {
        label: "Results",
        href: "/app/results",
        icon: "results",
        preview: {
          title: "Results",
          purpose: "See assessment outcomes across students and correct official results.",
          sections: [
            "Marks by student, assessment, part, and publication state.",
            "Feedback, averages, and result history.",
            "Corrections to published results and the parent notice those changes require.",
          ],
          actions: ["Open a result, publish complete marks, or correct a published result."],
        },
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Messages",
        href: "/app/manage/messages",
        icon: "communications",
        preview: {
          title: "Messages",
          purpose: "Follow the parent notifications created by published academic events.",
          sections: [
            "Events for absence, replacement attendance, published results, and parent-visible notes.",
            "Queued, sent, failed, and retried delivery states.",
            "Provider diagnostics shown only to authorized staff.",
          ],
          actions: ["Owners, Head Admins and Admins retry eligible failures; Instructors see simple delivery status."],
        },
      },
      {
        label: "Coupons",
        href: "/app/manage/access",
        icon: "access",
        roles: MANAGERS,
        preview: {
          title: "Access and coupons",
          purpose: "Manage release access while preserving the source of every entitlement.",
          sections: [
            "Coupon batches, permitted audience, raw-code handling, and redemption status.",
            "Effective student access from attendance, coupon redemption, or manual grant.",
            "The seven-day access period, one student extension, and authorized manual-access options.",
          ],
          actions: ["Generate or revoke coupons and apply permitted grants or revocations."],
        },
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        label: "Manage",
        href: "/app/manage",
        icon: "settings",
        preview: {
          title: "Manage academy",
          purpose: "The administration workspace for intake, access, communication, and academy setup.",
          sections: [
            "Booking form settings and registrations for student intake.",
            "Student access, coupons, and parent message delivery.",
            "Academy profile, structure, booking form, team, notifications, and integrations.",
            "Personal account and security settings.",
          ],
        },
        children: [
          {
            label: "General",
            href: "/app/manage/academy",
            icon: "academy",
          },
          {
            label: "Structure",
            href: "/app/manage/academy/structure",
            icon: "structure",
            preview: {
              title: "Structure",
              purpose: "Define the programs and grouping used throughout the academy.",
              sections: [
                "Platform levels offered by the academy and its own tracks.",
                "Program combinations and how groups fit beneath them.",
                "Role-aware setup controls for programs and groups.",
              ],
            },
          },
          {
            label: "Enrollment",
            href: "/app/manage/academy/enrollment",
            icon: "studentEnrollment",
          },
          {
            label: "Team",
            href: "/app/manage/team",
            icon: "team",
            preview: {
              title: "Team",
              purpose: "See academy staff and manage permitted invitations.",
              sections: [
                "Current Owner, Admin, and Instructor memberships and their status.",
                "Pending, accepted, expired, and revoked invitations.",
                "Role-specific controls for inviting or changing staff membership.",
              ],
            },
          },
          {
            label: "Notifications",
            href: "/app/manage/notifications",
            icon: "notifications",
            roles: MANAGERS,
            preview: {
              title: "Notifications",
              purpose: "Set academy rules for proactive parent communication.",
              sections: [
                "Parent event types for absence, replacement attendance, results, and visible notes.",
                "Delivery preferences and the relationship to publication actions.",
                "Operational defaults for failed-message handling.",
              ],
            },
          },
          {
            label: "Integrations",
            href: "/app/manage/integrations",
            icon: "integrations",
            roles: MANAGERS,
            preview: {
              title: "Integrations",
              purpose: "Inspect the services used for parent delivery and protected video.",
              sections: [
                "WhatsApp delivery and protected-video provider connection status.",
                "Provider health and relevant setup guidance.",
                "Credential controls restricted to the Owner.",
              ],
            },
          },
        ],
      },
    ],
  },
];

export const STAFF_ACCOUNT: NavItem = {
  label: "Account",
  href: "/app/manage/account",
  icon: "account",
  preview: {
    title: "Personal settings",
    purpose: "Review the personal account used to sign in to Edra.",
    sections: [
      "Account identity and contact details.",
      "Password, recovery, and sign-in security options.",
      "Session and account preferences relevant to staff work.",
    ],
  },
};

export const STAFF_CREATE_ITEMS: readonly NavItem[] = [
  {
    label: "Add student",
    href: "/app/students/new",
    icon: "students",
  },
  {
    label: "Start session",
    href: "/app/attendance/new",
    icon: "sessions",
  },
  {
    label: "Create a schedule",
    href: "/app/schedules/new",
    icon: "schedules",
  },
  { label: "Assignment", href: "/app/assignments/new", icon: "assignments" },
  { label: "Quiz", href: "/app/quizzes/new", icon: "quizzes" },
  { label: "Exam", href: "/app/exams/new", icon: "exams" },
];

export const STUDENT_GROUPS: readonly NavGroup[] = [
  {
    label: "",
    items: [
      {
        label: "Home",
        href: "/learn",
        icon: "overview",
      },
      {
        label: "Calendar",
        href: "/learn/calendar",
        icon: "calendar",
        preview: {
          title: "Calendar",
          purpose: "A seven-day view of classes the student can attend.",
          sections: [
            "Scheduled sessions on a weekly event grid with date navigation.",
            "Class time, group, location, and session status.",
            "A compact agenda presentation for a phone.",
          ],
        },
      },
    ],
  },
  {
    label: "Learning",
    items: [
      {
        label: "Discover",
        href: "/learn/discover",
        icon: "content",
      },
      {
        label: "My courses",
        href: "/learn/courses",
        icon: "learning",
      },
    ],
  },
  {
    label: "My work",
    items: [
      {
        label: "Assignments",
        href: "/learn/assignments",
        icon: "assignments",
      },
      {
        label: "Quizzes",
        href: "/learn/quizzes",
        icon: "quizzes",
        preview: {
          title: "Quizzes",
          purpose: "See quiz windows and take each quiz once.",
          sections: [
            "Current quizzes, their windows, and any individual time limit.",
            "Your single attempt, its submission time, and how it was submitted.",
            "Announced results and feedback; solutions after the quiz closes.",
          ],
        },
      },
      {
        label: "Exams",
        href: "/learn/exams",
        icon: "exams",
      },
    ],
  },
  {
    label: "Records",
    items: [
      {
        label: "Results",
        href: "/learn/results",
        icon: "results",
        preview: {
          title: "Results",
          purpose: "See published assessment outcomes and feedback.",
          sections: [
            "Published assignment, quiz, and exam marks.",
            "Part scores, feedback, and result history.",
            "Corrections made after publication; staff drafts remain private.",
          ],
        },
      },
      {
        label: "Attendance",
        href: "/learn/attendance",
        icon: "attendance",
        preview: {
          title: "Attendance",
          purpose: "Review personal class attendance without losing the original history.",
          sections: [
            "Attendance status for dated sessions.",
            "Original absences and any later replacement attendance.",
            "Whether a replacement resolved the missed content access.",
          ],
        },
      },
    ],
  },
];

export const STUDENT_PROFILE: NavItem = {
  label: "Account",
  href: "/learn/profile",
  icon: "account",
  preview: {
    title: "Account",
    purpose: "Review the student's Edra account and verified details.",
    sections: [
      "Account identity and global school level.",
      "Verified parent phone shown in masked form.",
      "Password, recovery, and account security options.",
    ],
  },
};

export function canViewStaffItem(item: NavItem, role: StaffRole | null): boolean {
  return Boolean(role && (!item.roles || item.roles.includes(role)));
}

export function allStaffItems(): NavItem[] {
  return [
    ...STAFF_GROUPS.flatMap((group) => group.items.flatMap((item) => [item, ...(item.children ?? [])])),
    STAFF_ACCOUNT,
    ...STAFF_CREATE_ITEMS,
  ];
}

export function allStudentItems(): NavItem[] {
  return [...STUDENT_GROUPS.flatMap((group) => group.items), STUDENT_PROFILE];
}

export function findStaffItem(href: string): NavItem | undefined {
  return allStaffItems().find((item) => item.href === href);
}

export function findStudentItem(href: string): NavItem | undefined {
  return allStudentItems().find((item) => item.href === href);
}

export function parentHref(href: string): string | undefined {
  return allStaffItems()
    .filter((item) => item.href !== href && href.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
