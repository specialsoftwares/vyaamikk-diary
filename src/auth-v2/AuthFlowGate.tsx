import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  clearAuthWrapperChallenge,
  clearAuthWrapperProgress,
  loadAuthWrapperChallenge,
  markAuthWrapperEmailComplete,
  markAuthWrapperEmailPending,
  saveAuthWrapperChallenge,
} from "@/auth-v2/authWrapperProgress";
import { WizardProgress } from "@/auth-v2/components/WizardProgress";
import { EmailEntryScreen } from "@/auth-v2/screens/EmailEntryScreen";
import { OtpVerificationScreen } from "@/auth-v2/screens/OtpVerificationScreen";
import { PhoneEntryScreen } from "@/auth-v2/screens/PhoneEntryScreen";
import { sendOtpForWrapper } from "@/auth-v2/services/authWrapperService";
import type { AuthV2PhoneDraft, AuthV2Step } from "@/auth-v2/types";
import { DEFAULT_AUTH_V2_COUNTRY_CODE } from "@/auth-v2/types";
import { toE164FromDraft } from "@/auth-v2/phoneValidation";
import { AppError, userFacingMessage } from "@/domain/errors";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import {
  consentPatchForProfile,
  savePendingConsent,
} from "@/services/consent/legalConsentService";
import {
  completeBusinessEmailBind,
  resendBusinessEmailVerification,
  startBusinessEmailVerification,
} from "@/services/auth/bindBusinessEmail";
import { shouldShowLocalMockEmailOtpHint } from "@/services/auth/localMockEmailOtp";
import { hasAuthoritativeVerifiedEmail } from "@/auth/identityRouteState";
import {
  markContinuingWizardStep,
  markReviewingWizardStep,
} from "@/auth/onboardingGuardPolicy";
import {
  clearOnboardingNavigationState,
  loadOnboardingNavigationState,
} from "@/auth/onboardingNavigationStore";
import { clearOnboardingProfileDraft } from "@/auth/onboardingProfileDraft";
import {
  isPreDashboardOnboardingIncomplete,
  sameEmailAddress,
  type OnboardingWizardStep,
} from "@/auth/onboardingWizard";
import {
  useAuthoritativeCountdown,
  useAuthoritativeResendCountdown,
} from "@/hooks/useAuthoritativeResendCountdown";
import { formatOtpCountdownMmSs } from "@/utils/otpCountdownFormat";
import { Banner, Button, LocaleUiText } from "@/components/ui";
import { spacing, typography } from "@/theme";
import type { OtpChallenge } from "@/services/auth/types";

const EMAIL_CODE_LENGTH = 6;

function localDigitsFromE164(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 10) return digits;
  return digits.slice(-10);
}

/** Prefer receipt-anchored retry duration when present (avoids clock skew). */
function authoritativeResendAvailableAt(details?: {
  resendAvailableAt?: unknown;
  retryAfterSeconds?: unknown;
}): number | null {
  const retry = details?.retryAfterSeconds;
  if (typeof retry === "number" && Number.isFinite(retry) && retry >= 0) {
    return Date.now() + Math.ceil(retry) * 1000;
  }
  const until = details?.resendAvailableAt;
  if (typeof until === "number" && Number.isFinite(until)) return until;
  return null;
}

function uiStepToWizard(step: AuthV2Step | "email_verify"): OnboardingWizardStep {
  switch (step) {
    case "phone":
      return "mobileEntry";
    case "confirm":
      return "phoneConfirm";
    case "otp":
      return "phoneOtp";
    case "email":
      return "emailEntry";
    case "email_verify":
      return "emailOtp";
    default:
      return "mobileEntry";
  }
}

/**
 * Premium Indigo auth wrapper — sole sign-in entry for the app.
 */
export function AuthFlowGate() {
  const t = useT();
  const router = useRouter();
  const {
    step: paramStep,
    from: paramFrom,
    intent: paramIntent,
  } = useLocalSearchParams<{
    step?: string;
    from?: string;
    intent?: string;
  }>();
  const { status, user, startOtp, confirmOtp, updateProfile, applyServerProfile, signOut } =
    useAuth();

  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState<AuthV2Step | "email_verify">("phone");
  const [phoneDraft, setPhoneDraft] = useState<AuthV2PhoneDraft>({
    countryCode: DEFAULT_AUTH_V2_COUNTRY_CODE,
    localNumber: "",
  });
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [emailVerificationId, setEmailVerificationId] = useState<string | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [emailResendAvailableAt, setEmailResendAvailableAt] = useState<number | null>(null);
  const [emailExpiresAt, setEmailExpiresAt] = useState<number | null>(null);
  const [mobileExpiresAt, setMobileExpiresAt] = useState<number | null>(null);
  const [mobileResendAvailableAt, setMobileResendAvailableAt] = useState<number | null>(null);
  const [mobileLockUntil, setMobileLockUntil] = useState<number | null>(null);
  const [mobileOtpDigits, setMobileOtpDigits] = useState("");
  const emailCodeInputRef = useRef<TextInput>(null);
  const emailVerifyInFlightRef = useRef(false);
  const emailResendInFlightRef = useRef(false);
  const reviewingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const { remainingSeconds: emailResendRemaining, canResend: emailCanResend } =
    useAuthoritativeResendCountdown(step === "email_verify" ? emailResendAvailableAt : null);
  const emailValidityRemaining = useAuthoritativeCountdown(
    step === "email_verify" ? emailExpiresAt : null
  );

  const goToBusinessIdentity = useCallback(async () => {
    if (user) {
      await markContinuingWizardStep("businessIdentity", user.uid, {
        phoneE164: user.phoneE164,
        verifiedEmail: user.normalizedEmail ?? user.businessEmail,
      });
    }
    router.replace("/(auth)/complete-profile");
  }, [router, user]);

  const handoffToApp = useCallback(() => {
    router.replace("/");
  }, [router]);

  const abandonWizardAndSignOut = useCallback(() => {
    Alert.alert(
      "Sign out and start again?",
      "This abandons the current incomplete registration on this device. You can sign in again with any mobile number.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const uid = user?.uid;
              await clearOnboardingNavigationState();
              await clearAuthWrapperProgress(uid);
              if (uid) await clearOnboardingProfileDraft(uid);
              await signOut();
              setStep("phone");
              setChallenge(null);
              setPhoneE164(null);
              setEmailDraft("");
              setEmailVerificationId(null);
              setEmailCode("");
              setError(null);
              reviewingRef.current = false;
            })();
          },
        },
      ]
    );
  }, [signOut, user?.uid]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (status === "loading") return;

      const nav = await loadOnboardingNavigationState();
      const reviewRequested =
        paramIntent === "review" ||
        paramFrom === "profile" ||
        nav?.intent === "reviewPreviousStep";
      reviewingRef.current = Boolean(reviewRequested);

      if (status === "signed_in" && user) {
        const onboardingIncomplete = isPreDashboardOnboardingIncomplete(user, {
          locationConsentShown: false,
        });

        // Fully past email+profile gates → leave auth wrapper (boot continues).
        if (hasAuthoritativeVerifiedEmail(user) && user.profileCompletedAt && !reviewRequested) {
          await clearOnboardingNavigationState();
          if (!cancelled) handoffToApp();
          return;
        }

        // Deliberate review of an earlier auth step — never bounce to boot.
        if (reviewRequested) {
          if (user.phoneE164) {
            setPhoneE164(user.phoneE164);
            setPhoneDraft({
              countryCode: DEFAULT_AUTH_V2_COUNTRY_CODE,
              localNumber: localDigitsFromE164(user.phoneE164),
            });
            setTermsAccepted(true);
            setPrivacyAccepted(true);
          }
          setEmailDraft(user.businessEmail ?? user.normalizedEmail ?? "");
          let reviewUi: AuthV2Step | "email_verify" = "email";
          if (paramStep === "email_verify" || nav?.currentStep === "emailOtp") {
            reviewUi = "email_verify";
          } else if (
            paramStep === "phone" ||
            nav?.currentStep === "mobileEntry" ||
            nav?.currentStep === "phoneConfirm" ||
            nav?.currentStep === "phoneOtp"
          ) {
            reviewUi =
              nav?.currentStep === "phoneOtp"
                ? "otp"
                : nav?.currentStep === "phoneConfirm"
                  ? "confirm"
                  : "phone";
          } else {
            reviewUi = "email";
          }
          setStep(reviewUi);
          await markReviewingWizardStep(uiStepToWizard(reviewUi), user.uid, {
            phoneE164: user.phoneE164,
            verifiedEmail: hasAuthoritativeVerifiedEmail(user)
              ? user.normalizedEmail ?? user.businessEmail
              : null,
          });
          if (!cancelled) setHydrated(true);
          return;
        }

        // Continue / boot into wrapper: land on email until verified; then profile.
        if (!hasAuthoritativeVerifiedEmail(user)) {
          setEmailDraft(user.businessEmail ?? "");
          if (user.phoneE164) {
            setPhoneE164(user.phoneE164);
            setPhoneDraft({
              countryCode: DEFAULT_AUTH_V2_COUNTRY_CODE,
              localNumber: localDigitsFromE164(user.phoneE164),
            });
          }
          setStep(
            user.emailStatus === "verification_pending" &&
              (user.normalizedEmail || user.businessEmail)
              ? "email"
              : "email"
          );
          await markContinuingWizardStep("emailEntry", user.uid, {
            phoneE164: user.phoneE164,
          });
          if (!cancelled) setHydrated(true);
          return;
        }

        // Email verified, profile still incomplete → leave wrapper for profile
        // (do NOT replace "/" here when already mid-wizard review — handled above).
        if (onboardingIncomplete) {
          if (!cancelled) await goToBusinessIdentity();
          return;
        }

        if (!cancelled) handoffToApp();
        return;
      }

      const snap = await loadAuthWrapperChallenge();
      if (snap && !cancelled) {
        setPhoneE164(snap.phoneE164);
        setChallenge({
          verificationId: snap.verificationId,
          phoneE164: snap.phoneE164,
          devCodeHint: snap.devCodeHint,
        });
        setDevHint(snap.devCodeHint);
        setStep("otp");
        setPhoneDraft({
          countryCode: DEFAULT_AUTH_V2_COUNTRY_CODE,
          localNumber: localDigitsFromE164(snap.phoneE164),
        });
      }
      if (!cancelled) setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally omit `step` — hydration must not re-run on every local step change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user?.uid, paramStep, paramFrom, paramIntent, handoffToApp, goToBusinessIdentity]);

  useEffect(() => {
    if (status === "signed_in" && user && paramStep === "email" && reviewingRef.current) {
      setStep("email");
      setEmailDraft(user.businessEmail ?? user.normalizedEmail ?? "");
    }
  }, [paramStep, status, user]);

  // Hardware Back — one logical wizard step (never no-op loop).
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (step === "phone") return false;
      if (step === "confirm") {
        setStep("phone");
        return true;
      }
      if (step === "otp") {
        setStep("confirm");
        return true;
      }
      if (step === "email_verify") {
        setStep("email");
        setEmailCode("");
        return true;
      }
      if (step === "email") {
        void (async () => {
          await goBackFromEmail();
        })();
        return true;
      }
      return false;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, status, user]);

  const goBackFromEmail = async () => {
    reviewingRef.current = true;
    if (user?.phoneE164) {
      setPhoneE164(user.phoneE164);
      setPhoneDraft({
        countryCode: DEFAULT_AUTH_V2_COUNTRY_CODE,
        localNumber: localDigitsFromE164(user.phoneE164),
      });
      setTermsAccepted(true);
      setPrivacyAccepted(true);
    }
    setError(null);
    setStep("phone");
    await markReviewingWizardStep("mobileEntry", user?.uid ?? null, {
      phoneE164: user?.phoneE164 ?? phoneE164,
    });
  };

  const beginPhoneChangeSession = async (nextE164: string) => {
    const previousUid = user?.uid;
    await clearOnboardingNavigationState();
    await clearAuthWrapperProgress(previousUid);
    if (previousUid) await clearOnboardingProfileDraft(previousUid);
    if (status === "signed_in") {
      await signOut();
    }
    setEmailDraft("");
    setEmailVerificationId(null);
    setEmailCode("");
    setEmailHint(null);
    setEmailResendAvailableAt(null);
    setEmailExpiresAt(null);
    setPhoneE164(nextE164);
    reviewingRef.current = false;
  };

  const handleContinueToConfirm = () => {
    setError(null);
    try {
      const e164 = toE164FromDraft(phoneDraft.countryCode, phoneDraft.localNumber);
      // Same verified mobile while reviewing — skip OTP and return to email.
      if (
        status === "signed_in" &&
        user?.phoneE164 &&
        e164 === user.phoneE164 &&
        reviewingRef.current
      ) {
        setPhoneE164(e164);
        setStep("email");
        void markContinuingWizardStep("emailEntry", user.uid, { phoneE164: e164 });
        return;
      }
      // Changing a previously verified mobile — confirm isolation, then re-OTP.
      if (status === "signed_in" && user?.phoneE164 && e164 !== user.phoneE164) {
        Alert.alert(
          "Change mobile number?",
          "Email verification and later onboarding steps must be completed again for the new number. The previous incomplete session will not carry over.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Continue",
              style: "destructive",
              onPress: () => {
                void (async () => {
                  setLoading(true);
                  try {
                    await beginPhoneChangeSession(e164);
                    setStep("confirm");
                  } catch (err) {
                    setError(userFacingMessage(err));
                  } finally {
                    setLoading(false);
                  }
                })();
              },
            },
          ]
        );
        return;
      }
      setPhoneE164(e164);
      setStep("confirm");
      void markContinuingWizardStep("phoneConfirm", user?.uid ?? null, { phoneE164: e164 });
    } catch (e) {
      setError(userFacingMessage(e));
    }
  };

  const handleConfirmSend = async () => {
    if (!phoneE164 || !termsAccepted || !privacyAccepted) return;
    setError(null);
    setLoading(true);
    try {
      await savePendingConsent(phoneE164, "auth_v2_phone_confirm");
      const next = await sendOtpForWrapper(phoneE164);
      setChallenge({ ...next, devCodeHint: null });
      setDevHint(null);
      setMobileExpiresAt(next.expiresAt ?? Date.now() + 10 * 60_000);
      setMobileResendAvailableAt(next.resendAvailableAt ?? Date.now() + 30_000);
      setMobileLockUntil(null);
      setMobileOtpDigits("");
      await saveAuthWrapperChallenge({
        phoneE164: next.phoneE164,
        verificationId: next.verificationId,
        devCodeHint: null,
      });
      setStep("otp");
      await markContinuingWizardStep("phoneOtp", user?.uid ?? null, {
        phoneE164: next.phoneE164,
      });
      const { saveMobileOtpDigitSnapshot } = await import(
        "@/services/auth/mobileOtpSecureDigits"
      );
      await saveMobileOtpDigitSnapshot({
        phoneE164: next.phoneE164,
        verificationId: next.verificationId,
        digits: "",
        expiresAt: next.expiresAt ?? Date.now() + 10 * 60_000,
        resendAvailableAt: next.resendAvailableAt ?? Date.now() + 30_000,
      });
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    if (!challenge) return;
    setError(null);
    setLoading(true);
    try {
      const profile = await confirmOtp(challenge, code);
      await clearAuthWrapperChallenge();
      setChallenge(null);

      const consentPatch = await consentPatchForProfile(profile);
      if (consentPatch) {
        await updateProfile(consentPatch);
      }

      if (hasAuthoritativeVerifiedEmail(profile) && profile.profileCompletedAt) {
        await markAuthWrapperEmailComplete(profile.uid);
        await clearOnboardingNavigationState();
        handoffToApp();
        return;
      }

      if (hasAuthoritativeVerifiedEmail(profile)) {
        await markAuthWrapperEmailComplete(profile.uid);
        await goToBusinessIdentity();
        return;
      }

      await markAuthWrapperEmailPending(profile.uid);
      setEmailDraft(profile.businessEmail ?? "");
      setStep("email");
      await markContinuingWizardStep("emailEntry", profile.uid, {
        phoneE164: profile.phoneE164,
      });
      const { clearMobileOtpDigitSnapshot } = await import(
        "@/services/auth/mobileOtpSecureDigits"
      );
      await clearMobileOtpDigitSnapshot();
    } catch (e) {
      if (e instanceof AppError && e.code === "account_pending_deletion") {
        router.replace({
          pathname: "/(auth)/account-pending-deletion",
          params: {
            phoneE164: String(e.details?.phoneE164 ?? challenge.phoneE164),
            deletionScheduledFor: String(e.details?.deletionScheduledFor ?? ""),
            maskedEmail: String(e.details?.maskedEmail ?? ""),
          },
        });
        return;
      }
      if (e instanceof AppError && e.code === "too_many_attempts") {
        const until = e.details?.lockUntil;
        if (typeof until === "number") setMobileLockUntil(until);
      }
      if (e instanceof AppError && (e.code === "invalid_otp" || e.code === "otp_expired")) {
        setMobileOtpDigits("");
      }
      setError(userFacingMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!phoneE164) return;
    setError(null);
    setResending(true);
    try {
      const next = await startOtp(phoneE164);
      setChallenge({ ...next, devCodeHint: null });
      setDevHint(null);
      setMobileOtpDigits("");
      setMobileExpiresAt(next.expiresAt ?? Date.now() + 10 * 60_000);
      setMobileResendAvailableAt(next.resendAvailableAt ?? Date.now() + 30_000);
      setMobileLockUntil(null);
      await saveAuthWrapperChallenge({
        phoneE164: next.phoneE164,
        verificationId: next.verificationId,
        devCodeHint: null,
      });
      const { saveMobileOtpDigitSnapshot } = await import(
        "@/services/auth/mobileOtpSecureDigits"
      );
      await saveMobileOtpDigitSnapshot({
        phoneE164: next.phoneE164,
        verificationId: next.verificationId,
        digits: "",
        expiresAt: next.expiresAt ?? Date.now() + 10 * 60_000,
        resendAvailableAt: next.resendAvailableAt ?? Date.now() + 30_000,
      });
    } catch (e) {
      if (e instanceof AppError && e.details?.resendAvailableAt != null) {
        setMobileResendAvailableAt(Number(e.details.resendAvailableAt));
        setError(null);
        return;
      }
      setError(userFacingMessage(e));
    } finally {
      setResending(false);
    }
  };

  const handleEmailContinue = async () => {
    const trimmed = emailDraft.trim().toLowerCase();
    if (!user) return;
    setError(null);
    setEmailHint(null);
    setLoading(true);
    try {
      // Same already-verified email — continue to profile without a new OTP.
      if (
        hasAuthoritativeVerifiedEmail(user) &&
        sameEmailAddress(trimmed, user.normalizedEmail ?? user.businessEmail ?? "")
      ) {
        await goToBusinessIdentity();
        return;
      }

      // Changing a verified email during incomplete onboarding — clear verified status.
      if (
        hasAuthoritativeVerifiedEmail(user) &&
        !sameEmailAddress(trimmed, user.normalizedEmail ?? user.businessEmail ?? "")
      ) {
        await updateProfile({
          businessEmail: trimmed,
          normalizedEmail: trimmed,
          emailStatus: "verification_pending",
          emailVerifiedAt: null,
        });
      }

      const { verificationId, devCodeHint, resendAvailableAt, expiresAt } =
        await startBusinessEmailVerification(user.uid, trimmed);
      setEmailVerificationId(verificationId);
      setEmailCode("");
      setEmailResendAvailableAt(resendAvailableAt ?? Date.now() + 30_000);
      setEmailExpiresAt(expiresAt ?? Date.now() + 15 * 60_000);
      if (devCodeHint && shouldShowLocalMockEmailOtpHint()) {
        // Spec: never display development OTP in the UI.
        setEmailHint(null);
      } else {
        setEmailHint(null);
      }
      setStep("email_verify");
      reviewingRef.current = false;
      await markContinuingWizardStep("emailOtp", user.uid, {
        phoneE164: user.phoneE164,
      });
      setTimeout(() => emailCodeInputRef.current?.focus(), 280);
    } catch (e) {
      if (e instanceof AppError && e.code === "email_otp_cooldown") {
        const until = authoritativeResendAvailableAt(e.details);
        if (until != null) setEmailResendAvailableAt(until);
        setError(null);
        setStep("email_verify");
        return;
      }
      if (e instanceof AppError && e.code === "email_already_linked") {
        setError(e.message);
        return;
      }
      if (e instanceof AppError && e.code === "email_pending_deletion") {
        setError(e.message);
        return;
      }
      setError(userFacingMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailResend = async () => {
    if (!user || !emailVerificationId || emailResendInFlightRef.current) return;
    if (emailResendAvailableAt != null && Date.now() < emailResendAvailableAt) return;
    emailResendInFlightRef.current = true;
    setError(null);
    setResending(true);
    try {
      const next = await resendBusinessEmailVerification(
        user.uid,
        emailVerificationId,
        emailDraft.trim().toLowerCase()
      );
      setEmailVerificationId(next.verificationId);
      setEmailCode("");
      setEmailResendAvailableAt(next.resendAvailableAt ?? Date.now() + 30_000);
      setEmailExpiresAt(next.expiresAt ?? Date.now() + 15 * 60_000);
      if (next.devCodeHint && shouldShowLocalMockEmailOtpHint()) {
        setEmailHint(null);
      }
    } catch (e) {
      if (e instanceof AppError && e.code === "email_otp_cooldown") {
        const until = authoritativeResendAvailableAt(e.details);
        if (until != null) setEmailResendAvailableAt(until);
        setError(null);
        return;
      }
      setError(userFacingMessage(e));
    } finally {
      emailResendInFlightRef.current = false;
      setResending(false);
    }
  };

  const handleVerifyEmailCode = async () => {
    if (!user || !emailVerificationId || emailCode.length !== EMAIL_CODE_LENGTH) return;
    if (emailVerifyInFlightRef.current) return;
    emailVerifyInFlightRef.current = true;
    setError(null);
    setLoading(true);
    try {
      const profile = await completeBusinessEmailBind(
        user.uid,
        emailVerificationId,
        emailCode,
        async (patch) => {
          if (Object.keys(patch).length === 0) return user;
          return updateProfile(patch);
        }
      );
      await applyServerProfile(profile);
      await markAuthWrapperEmailComplete(profile.uid);
      await goToBusinessIdentity();
    } catch (e) {
      setError(userFacingMessage(e));
      setEmailCode("");
    } finally {
      emailVerifyInFlightRef.current = false;
      setLoading(false);
    }
  };

  // Auto-verify once per completed code entry — dedupe Strict Mode / rerenders.
  const lastAutoSubmittedEmailCodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (step !== "email_verify") return;
    if (emailCode.length < EMAIL_CODE_LENGTH) {
      lastAutoSubmittedEmailCodeRef.current = null;
      return;
    }
    if (emailCode.length !== EMAIL_CODE_LENGTH) return;
    if (lastAutoSubmittedEmailCodeRef.current === emailCode) return;
    lastAutoSubmittedEmailCodeRef.current = emailCode;
    void handleVerifyEmailCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on completed code only
  }, [emailCode, step]);

  const resetToPhone = async () => {
    setStep("phone");
    setChallenge(null);
    setError(null);
    await clearAuthWrapperChallenge();
    // "Change number" from OTP before sign-in — stay local.
    if (status !== "signed_in") {
      setPhoneE164(null);
      return;
    }
    // Signed-in review: keep session; user must confirm to switch numbers later.
    if (user?.phoneE164) {
      setPhoneE164(user.phoneE164);
      setPhoneDraft({
        countryCode: DEFAULT_AUTH_V2_COUNTRY_CODE,
        localNumber: localDigitsFromE164(user.phoneE164),
      });
    }
    reviewingRef.current = true;
    await markReviewingWizardStep("mobileEntry", user?.uid ?? null, {
      phoneE164: user?.phoneE164 ?? null,
    });
  };

  if (!hydrated || status === "loading") {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  const phoneVerifiedChip = status === "signed_in" && Boolean(user?.phoneE164);
  const emailVerifiedChip = hasAuthoritativeVerifiedEmail(user);

  if (step === "phone" || step === "confirm") {
    return (
      <PhoneEntryScreen
        draft={phoneDraft}
        onDraftChange={setPhoneDraft}
        step={step}
        termsAccepted={termsAccepted}
        privacyAccepted={privacyAccepted}
        onTermsAcceptedChange={setTermsAccepted}
        onPrivacyAcceptedChange={setPrivacyAccepted}
        onContinueToConfirm={handleContinueToConfirm}
        onConfirmSend={() => void handleConfirmSend()}
        onBackFromConfirm={() => setStep("phone")}
        onBack={undefined}
        loading={loading}
        error={error}
      />
    );
  }

  if (step === "otp" && challenge && phoneE164) {
    return (
      <OtpVerificationScreen
        phoneE164={phoneE164}
        devCodeHint={null}
        expiresAt={mobileExpiresAt ?? challenge.expiresAt ?? null}
        resendAvailableAt={mobileResendAvailableAt ?? challenge.resendAvailableAt ?? null}
        lockUntil={mobileLockUntil}
        initialDigits={mobileOtpDigits}
        onDigitsChange={(digits) => {
          setMobileOtpDigits(digits);
          void (async () => {
            const { saveMobileOtpDigitSnapshot } = await import(
              "@/services/auth/mobileOtpSecureDigits"
            );
            await saveMobileOtpDigitSnapshot({
              phoneE164,
              verificationId: challenge.verificationId,
              digits,
              expiresAt: mobileExpiresAt ?? Date.now() + 10 * 60_000,
              resendAvailableAt: mobileResendAvailableAt ?? Date.now() + 30_000,
            });
          })();
        }}
        onVerify={(code) => void handleVerifyOtp(code)}
        onResend={() => void handleResend()}
        onChangeNumber={() => {
          void (async () => {
            const { localMockCancelMobileOtp } = await import(
              "@/services/auth/localMockMobileOtp"
            );
            localMockCancelMobileOtp(phoneE164);
            const { clearMobileOtpDigitSnapshot } = await import(
              "@/services/auth/mobileOtpSecureDigits"
            );
            await clearMobileOtpDigitSnapshot();
            await resetToPhone();
          })();
        }}
        loading={loading}
        resending={resending}
        error={error}
      />
    );
  }

  if (step === "email_verify") {
    const emailVerifyComplete = emailCode.length === EMAIL_CODE_LENGTH;
    const showDevHint = Boolean(emailHint && shouldShowLocalMockEmailOtpHint());
    return (
      <View style={styles.boot}>
        <View style={styles.emailVerifyCard}>
          <WizardProgress
            step="emailOtp"
            verifiedMobile={phoneVerifiedChip}
            verifiedEmail={emailVerifiedChip}
          />
          <LocaleUiText style={styles.emailVerifyTitle}>
            {t("pendingDeletion.reactivateEmailTitle")}
          </LocaleUiText>
          <LocaleUiText style={styles.emailVerifyBody}>
            {t("pendingDeletion.reactivateEmailHint")}
          </LocaleUiText>
          {showDevHint ? <Banner tone="info" message={emailHint!} /> : null}
          {emailValidityRemaining > 0 ? (
            <LocaleUiText style={styles.emailTiming}>
              {`Code valid for ${formatOtpCountdownMmSs(emailValidityRemaining)}`}
            </LocaleUiText>
          ) : (
            <LocaleUiText style={styles.emailTiming}>Code expired — request a new one.</LocaleUiText>
          )}
          {error ? <Banner tone="danger" message={error} /> : null}
          <TextInput
            ref={emailCodeInputRef}
            style={styles.emailCodeInput}
            value={emailCode}
            onChangeText={(text) =>
              setEmailCode(text.replace(/\D/g, "").slice(0, EMAIL_CODE_LENGTH))
            }
            keyboardType="number-pad"
            maxLength={EMAIL_CODE_LENGTH}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            placeholder={t("otp.codePlaceholder")}
            editable={!loading}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (emailVerifyComplete) void handleVerifyEmailCode();
            }}
          />
          <Button
            label={t("pendingDeletion.verifyAndReactivate")}
            onPress={() => void handleVerifyEmailCode()}
            loading={loading}
            disabled={!emailVerifyComplete || loading}
          />
          <View style={styles.emailResendRow}>
            {emailResendRemaining > 0 ? (
              <LocaleUiText style={styles.emailTiming}>
                {`Resend OTP in ${formatOtpCountdownMmSs(emailResendRemaining)}`}
              </LocaleUiText>
            ) : (
              <Pressable
                onPress={() => void handleEmailResend()}
                disabled={!emailCanResend || resending || loading}
                accessibilityRole="button"
              >
                <Text style={[styles.emailResendLink, (resending || loading) && { opacity: 0.5 }]}>
                  {resending ? t("otp.resending") : t("otp.resend")}
                </Text>
              </Pressable>
            )}
          </View>
          <Button
            label={t("common.back")}
            variant="ghost"
            onPress={() => {
              setStep("email");
              setEmailCode("");
              setError(null);
              void markReviewingWizardStep("emailEntry", user?.uid ?? null);
            }}
            disabled={loading || resending}
          />
          <Pressable onPress={abandonWizardAndSignOut} accessibilityRole="button">
            <Text style={styles.signOutLink}>Sign out and start again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === "email") {
    return (
      <View style={{ flex: 1 }}>
        <EmailEntryScreen
          value={emailDraft}
          onChange={setEmailDraft}
          onContinue={() => void handleEmailContinue()}
          onBack={() => void goBackFromEmail()}
          loading={loading}
          error={error}
          hint={
            emailVerifiedChip
              ? "Email verified — edit only if you need a different address (re-verification required)."
              : user?.businessEmail
                ? t("authV2.email.prefilledHint")
                : null
          }
        />
        <View style={styles.wizardChrome}>
          <WizardProgress
            step="emailEntry"
            verifiedMobile={phoneVerifiedChip}
            verifiedEmail={emailVerifiedChip}
          />
          <Pressable onPress={abandonWizardAndSignOut} accessibilityRole="button">
            <Text style={styles.signOutLink}>Sign out and start again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <PhoneEntryScreen
      draft={phoneDraft}
      onDraftChange={setPhoneDraft}
      step="phone"
      termsAccepted={termsAccepted}
      privacyAccepted={privacyAccepted}
      onTermsAcceptedChange={setTermsAccepted}
      onPrivacyAcceptedChange={setPrivacyAccepted}
      onContinueToConfirm={handleContinueToConfirm}
      onConfirmSend={() => void handleConfirmSend()}
      onBackFromConfirm={() => setStep("phone")}
      error={t("errors.sessionExpired")}
    />
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#12152E",
    padding: spacing.lg,
  },
  emailVerifyCard: {
    width: "100%",
    maxWidth: 400,
    gap: spacing.md,
  },
  emailVerifyTitle: {
    ...typography.titleMd,
    color: "#FFFFFF",
    textAlign: "center",
  },
  emailVerifyBody: {
    ...typography.body,
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    lineHeight: 22,
  },
  emailCodeInput: {
    ...typography.mono,
    fontSize: 24,
    letterSpacing: 6,
    textAlign: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    color: "#FFFFFF",
    backgroundColor: "rgba(255,255,255,0.06)",
    ...(Platform.OS === "android" ? { textAlignVertical: "center" as const } : {}),
  },
  emailTiming: {
    ...typography.caption,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
  },
  emailResendRow: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
  },
  emailResendLink: {
    ...typography.captionStrong,
    color: "#A5B4FC",
    textAlign: "center",
  },
  wizardChrome: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    gap: spacing.sm,
    pointerEvents: "box-none",
  },
  signOutLink: {
    ...typography.caption,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    textDecorationLine: "underline",
  },
});
