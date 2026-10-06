export const instructorJoinCopy = {
  progressLabel: "Staff setup progress",
  title: "Join an academy",
  description: "Don't have an invite? Ask your academy admins for one.",
  inviteLabel: "Invitation token",
  invitePlaceholder: "Paste invitation link or token here",
  roles: { admin: "Admin", instructor: "Instructor" },
  states: {
    valid: {
      title: "Join",
      description: (role: string) => `You’re invited as ${role}.`,
    },
    accepted: {
      title: "You’ve joined",
      description: "Open your academy to continue.",
    },
    alreadyMember: {
      title: "You’re already a member of",
      description: "Open your academy to continue.",
    },
    expired: { title: "This invitation has expired", description: "Ask your academy for a new invite." },
    revoked: { title: "This invitation was revoked", description: "Ask your academy for a new invite." },
    inviterUnavailable: { title: "This invitation is no longer valid", description: "Ask your academy for a new invite." },
    unavailable: { title: "This invitation isn’t available", description: "Check the link or token, or ask for a new invite." },
    wrongAccount: {
      title: "This invitation is for a different phone number",
      description: "Sign in with the invited phone number.",
    },
    unverified: {
      title: "Verify your phone number first",
      description: "Verify your phone number to continue.",
    },
    rateLimited: { title: "Too many attempts", description: "Wait a few minutes, then try again." },
    error: { title: "We couldn’t check this invitation", description: "Check your connection and try again." },
  },
  messages: {
    emptyInvite: "Enter an invitation link or token.",
    joinFailed: "Couldn’t join. Please try again.",
  },
  actions: {
    back: "Back",
    continue: "Continue",
    join: "Join academy",
    joining: "Joining…",
    openAcademy: "Open academy",
    retry: "Try again",
  },
} as const;
