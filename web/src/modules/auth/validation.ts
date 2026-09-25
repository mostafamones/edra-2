import { z } from "zod";

import { phoneSchema } from "../../lib/phone";

const credentialsSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(8, "Password must contain at least 8 characters"),
});

export const signInSchema = credentialsSchema;
export const signUpSchema = credentialsSchema
  .extend({
    firstName: z.string().trim().min(1, "First name is required").max(50),
    lastName: z.string().trim().min(1, "Last name is required").max(50),
  })
  .transform((value) => ({
    fullName: `${value.firstName} ${value.lastName}`,
    phone: value.phone,
    password: value.password,
  }));

export const verificationSchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const forgotPasswordSchema = z.object({ phone: phoneSchema });

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must contain at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type VerificationInput = z.infer<typeof verificationSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
