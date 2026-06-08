import type { OtpChallenge } from "@/services/auth/types";

export type AuthV2Step = "phone" | "confirm" | "otp" | "email";

export interface AuthV2PhoneDraft {
  countryCode: string;
  localNumber: string;
}

export interface AuthV2FlowState {
  step: AuthV2Step;
  phoneDraft: AuthV2PhoneDraft;
  phoneE164: string | null;
  challenge: OtpChallenge | null;
  devCodeHint: string | null;
  emailDraft: string;
}

export const DEFAULT_AUTH_V2_COUNTRY_CODE = "+91";
