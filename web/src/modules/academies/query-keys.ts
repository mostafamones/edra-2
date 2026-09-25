export const academyQueryKeys = {
  all: ["academies"] as const,
  detail: (academyId: string) => ["academies", academyId] as const,
  forUser: (userId: string) => ["academies", "memberships", userId] as const,
};
