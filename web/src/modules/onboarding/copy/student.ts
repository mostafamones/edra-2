export const studentOnboardingCopy = {
  progressLabel: "Student setup progress",
  loadError: "We couldn’t load your student setup. Refresh to try again.",
  screens: {
    parentNumber: {
      title: "Add a parent's contact",
      description: "Add a parent’s mobile number and confirm it with a code. We’ll use it for performance updates later.",
    },
    level: {
      title: "Choose your level",
      description: "Choose the school grade you’re currently in.",
      groupLabel: "Choose your level",
    },
  },
  phone: {
    label: "Parent mobile number",
    placeholder: "100 123 4567",
    start: "Start Verification",
    starting: "Starting...",
    cooldown: (seconds: number) => `You can start verification again in ${seconds}s.`,
  },
  verification: {
    instruction: "Enter the code sent to number enetered above via Whatsapp.",
    codeLabel: "Parent verification code",
    verify: "Verify",
    verifying: "Verifying...",
    changeNumber: "Change number",
    resend: "Resend code",
    resendIn: (seconds: number) => `Resend in ${seconds}s`,
    sending: "Please wait...",
  },
  status: {
    codeSent: "Enter the six-digit code to verify this number.",
    parentVerified: "Parent number verified.",
    verifiedTitle: "Parent number verified",
    verifiedNumber: (lastFour: string) => `Number ending in ${lastFour}`,
  },
  errors: {
    invalidPhone: "Enter a valid Egyptian mobile number.",
    invalidCode: "Enter the six-digit code.",
    chooseLevel: "Choose your level to continue.",
    byCode: {
      invalid_phone: "Enter a valid Egyptian mobile number.",
      same_phone: "Enter a parent number that is different from your account number.",
      account_phone_missing: "Verify your account phone before continuing.",
      account_phone_unverified: "Verify your account phone before continuing.",
      cooldown: "Wait a minute before requesting another code.",
      rate_limited: "You’ve requested too many codes. Try again in an hour.",
      invalid_code: "That code is incorrect. Check it and try again.",
      expired: "This code has expired. Request a new one.",
      locked: "Too many incorrect attempts. Request a new code.",
      used: "This code has already been used. Request a new one.",
      delivery_failed: "We couldn’t send the WhatsApp code. Please try again.",
      delivery_unavailable: "WhatsApp verification is unavailable right now.",
      profile_incomplete: "Verify a parent number before choosing a level.",
      invalid_level: "Choose one of the available levels.",
      already_complete: "Your student setup is already complete.",
      unavailable: "Something went wrong. Please try again.",
    },
  },
  actions: {
    continue: "Continue",
    finish: "Finish setup",
    saving: "Saving...",
    back: "Back",
  },
} as const;

export function getParentCodeErrorMessage(error: string) {
  const messages = studentOnboardingCopy.errors.byCode;
  return error in messages
    ? messages[error as keyof typeof messages]
    : messages.unavailable;
}
