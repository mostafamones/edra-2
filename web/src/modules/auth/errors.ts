const AUTH_ERROR_MESSAGES: Array<[RegExp, string]> = [
  [/invalid login credentials/i, "The phone number or password is incorrect."],
  [/phone.*already.*registered|user already registered/i, "An account already uses this phone number."],
  [/otp.*expired|token has expired/i, "That code has expired. Request a new code."],
  [/invalid.*otp|token.*invalid/i, "The verification code is incorrect."],
  [/rate limit|over.*limit|too many requests/i, "Too many attempts. Please wait before trying again."],
  [/whatsapp.*timed out|timed out.*whatsapp/i, "WhatsApp delivery timed out. Request a new code."],
  [/whatsapp.*rejected|send sms hook|unable to send.*(?:sms|message)|sms.*provider/i, "We could not send the WhatsApp code. Please try again."],
  [/phone.*provider.*disabled|phone.*signups.*disabled/i, "Phone authentication is not enabled yet."],
  [/password.*weak|weak password/i, "Choose a stronger password."],
  [/signup.*disabled/i, "Account creation is temporarily unavailable."],
];

export function getAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const knownMessage = AUTH_ERROR_MESSAGES.find(([pattern]) => pattern.test(message))?.[1];
  if (process.env.NODE_ENV === "development" && message) {
    return `${knownMessage ?? "Authentication failed."} (${message.slice(0, 240)})`;
  }

  return knownMessage ?? "We could not complete that request. Please try again.";
}
