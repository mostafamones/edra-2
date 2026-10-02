export {
  forgotPasswordSchema,
  recoverPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  verificationSchema,
} from "./validation";
export type {
  RecoverPasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
  VerificationInput,
} from "./validation";
export { AuthProvider, useAuth } from "./components/provider";
export { AcademyGate } from "./components/academy-gate";
export { useAcademyScope } from "./use-academy-scope";
