import { z } from "zod";

import { PROFILE_SALUTATION_CHOICE_IDS } from "@/domain/profileSalutation";

export const phoneSchema = z.object({
  mobile: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/u, "Enter a valid 10-digit Indian mobile number."),
});
export type PhoneFormValues = z.infer<typeof phoneSchema>;

export const otpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/u, "Enter the 6-digit OTP."),
});
export type OtpFormValues = z.infer<typeof otpSchema>;

/**
 * Legacy profile schema (settings). Onboarding uses `onboardingProfileSchema`
 * where every field is required.
 */
const meaningfulField = (requiredMessage: string, minMessage: string) =>
  z
    .string()
    .trim()
    .min(1, requiredMessage)
    .min(2, minMessage)
    .max(120)
    .refine((s) => /[\p{L}\p{N}]/u.test(s), minMessage);

export const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Please enter your name.").max(80),
  businessName: z.string().trim().max(120),
  workType: z.string().trim().max(120),
});
export type ProfileFormValues = z.infer<typeof profileSchema>;

/** First-time onboarding — all identity fields required for new registrations. */
export const onboardingProfileSchema = z.object({
  salutation: z.enum(
    PROFILE_SALUTATION_CHOICE_IDS as [
      (typeof PROFILE_SALUTATION_CHOICE_IDS)[number],
      ...(typeof PROFILE_SALUTATION_CHOICE_IDS)[number][],
    ]
  ),
  displayName: meaningfulField("Please enter your name.", "Enter a valid name."),
  businessName: meaningfulField(
    "Please enter your business or profession name.",
    "Enter a valid business or profession name."
  ),
  workType: meaningfulField(
    "Please enter your field of work.",
    "Enter a valid field of work."
  ),
  businessEmail: z
    .string()
    .trim()
    .min(1, "Please enter your business or professional email.")
    .email("Enter a valid email address.")
    .max(120),
  designation: meaningfulField(
    "Please select or enter your designation.",
    "Enter a valid designation."
  ),
});
export type OnboardingProfileFormValues = z.infer<typeof onboardingProfileSchema>;

/** Auth v2 onboarding — display name required; other identity fields optional. */
const optionalIdentityField = (maxMessage: string) =>
  z
    .string()
    .trim()
    .max(120, maxMessage)
    .refine((s) => s.length === 0 || /[\p{L}\p{N}]/u.test(s), maxMessage);

export const onboardingProfileCoreSchema = z.object({
  displayName: meaningfulField("Please enter your name.", "Enter a valid name."),
  businessName: optionalIdentityField("Enter a valid business or profession name."),
  workType: optionalIdentityField("Enter a valid field of work."),
  designation: optionalIdentityField("Enter a valid designation."),
});
export type OnboardingProfileCoreFormValues = z.infer<typeof onboardingProfileCoreSchema>;

export const entrySchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(120, "Title is too long."),
  category: z.enum([
    "work",
    "business",
    "site",
    "shop",
    "factory",
    "staff",
    "issue",
    "production",
    "followup",
    "personal",
    "other",
  ]),
  entryDate: z.number().int().positive(),
  notes: z.string().trim().max(5000, "Notes are too long."),
  locationName: z.string().trim().max(120),
  quantity: z.string().trim().max(60),
  issue: z.string().trim().max(500),
  tags: z.array(z.string().trim().min(1).max(30)).max(10),
  geo: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      accuracy: z.number().nullable(),
      capturedAt: z.number(),
    })
    .nullable(),
  reminder: z
    .object({
      at: z.number().int().positive(),
      note: z.string().trim().max(200),
      notificationId: z.string().nullable(),
    })
    .nullable(),
});
export type EntryFormValues = z.infer<typeof entrySchema>;
