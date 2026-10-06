export const roleChoiceCopy = {
  eyebrow: "Getting started",
  screens: {
    role: {
      title: "How will you use Edra?",
      description: "Choose the path that fits you. We’ll guide you through the rest.",
      options: {
        student: {
          title: "Student",
          description: "Discover academies and start learning.",
        },
        instructor: {
          title: "Instructor",
          description: "Create an academy or join one.",
        },
      },
    },
    instructor: {
      title: "What brings you here?",
      description: "Choose how you’d like to begin as an instructor.",
      options: {
        owner: {
          title: "Academy owner",
          description: "Set up your own academy space.",
        },
        join: {
          title: "Academy Instructor",
          description: "Join an academy as an instructor.",
        },
      },
    },
  },
  footer: {
    back: "Back",
    signOut: "Sign out",
    tagline: "Your path can grow from here",
  },
} as const;
