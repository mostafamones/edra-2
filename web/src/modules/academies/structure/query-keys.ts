export const academyStructureKey = (accountId: string, academyId: string) => ["academy-structure", accountId, academyId] as const;

/** Existing domain roots, scoped to the academy captured before the command started. */
export const offeringAffectedKeys = (accountId: string, academyId: string) => [
  academyStructureKey(accountId, academyId),
  ...["groups", "students", "student-imports", "student-enrollment", "schedules", "sessions", "attendance", "assignments", "quizzes", "exams", "content"]
    .map(domain => [domain, academyId] as const),
];
