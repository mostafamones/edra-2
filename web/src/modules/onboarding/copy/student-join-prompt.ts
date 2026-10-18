export const studentJoinPromptCopy = {
  progressLabel: "Academy setup progress",
  title: "Join an academy",
  description: "Paste the invite link your academy gave you, or skip for now and join later.",
  inviteLabel: "Invite link",
  invitePlaceholder: "Paste invite link here",
  messages: {
    invalidInvite: "That isn’t a valid student invite link. Check that you copied the whole link.",
    failed: "Couldn’t open the invite. Please try again.",
  },
  actions: { continue: "Continue", skip: "Skip for now" },
} as const;
