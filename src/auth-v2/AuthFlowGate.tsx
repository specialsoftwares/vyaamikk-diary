import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
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
import {
  phoneFallbackMayClaimSessionExpired,
  resolveAuthFlowGateRenderBranch,
} from "@/auth-v2/authFlowGateRenderDecision";
import { VerificationSuccessAck } from "@/auth-v2/components/VerificationSuccessAck";
import {
  ONBOARDING_MIN_VERIFYING_REDUCED_MS,
  ONBOARDING_MIN_VERIFYING_VISIBLE_MS,
} from "@/auth-v2/theme/onboardingMotion";
import { EmailEntryScreen } from "@/auth-v2/screens/EmailEntryScreen";
import { EmailOtpScreen } from "@/auth-v2/screens/EmailOtpScreen";
import { OtpVerificationScreen } from "@/auth-v2/screens/OtpVerificationScreen";
import { PhoneEntryScreen } from "@/auth-v2/screens/PhoneEntryScreen";
import { onboardingMark, onboardingMeasure } from "@/auth-v2/onboardingPerfProbe";
import { sendOtpForWrapper } from "@/auth-v2/services/authWrapperService";
import {
  getNativeAuthUid,
  isChallengeAutoVerified,
  observePostSendAuthForChallenge,
  subscribeNativeAuthState,
} from "@/services/auth/nativePhoneAuth";
import { phonesMatchE164 } from "@/services/auth/phoneChallengeAuthInvariant";
import {
  assertPhoneSendProvenance,
  resolveFreshPhoneSendTarget,
  resolveResendPhoneSendTarget,
} from "@/services/auth/phoneSendProvenance";
import {
  DEFAULT_AUTH_V2_COUNTRY_CODE,
  type AuthV2PhoneDraft,
  type AuthV2Step,
} from "@/auth-v2/types";
import { toE164FromDraft } from "@/auth-v2/phoneValidation";
import { AppError, userFacingMessage } from "@/domain/errors";
import {
  authFlowDiagnosticCode,
  authFlowErrorTitle,
  canRetryAccountSetupWithoutSms,
  resolveAuthFlowPhase,
} from "@/services/auth/authFlowErrorPresentation";
import {
  formatPhoneAuthCopyDiagnostics,
  formatPhoneAuthDisplayMessage,
  phoneAuthDiagnosticId,
} from "@/services/auth/nativePhoneAuthErrors";
import * as Clipboard from "expo-clipboard";
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
  clearWizardNavigationSession,
  markContinuingWizardStep,
  markReviewingWizardStep,
} from "@/auth/onboardingGuardPolicy";
import { loadOnboardingNavigationState } from "@/auth/onboardingNavigationStore";
import { clearOnboardingProfileDraft } from "@/auth/onboardingProfileDraft";
import {
  dispatchWizardNav,
  getWizardSnapshot,
  isReviewIntentActive,
} from "@/auth/wizardNavigationController";
import {
  beginEmailOtpSend,
  canVerifyEmailOtp,
  completeEmailOtpSend,
  createEmailOtpSendMachine,
  failEmailOtpSend,
  isBackBlockedDuringEmailSend,
  setRetainedDigits,
  type EmailOtpSendMachine,
} from "@/auth/emailOtpSendMachine";
import {
  isPreDashboardOnboardingIncomplete,
  sameEmailAddress,
  type OnboardingWizardStep,
} from "@/auth/onboardingWizard";
import {
  useAuthoritativeCountdown,
  useAuthoritativeResendCountdown,
} from "@/hooks/useAuthoritativeResendCountdown";
import { spacing, typography } from "@/theme";
import type { OtpChallenge } from "@/services/auth/types";
import { EMAIL_OTP_LENGTH } from "@/services/auth/emailOtpConstants";

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
  /** True only after THIS registration challenge completed phone auth + identity. */
  const [phoneChallengeProven, setPhoneChallengeProven] = useState(false);
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
  const [verificationVisual, setVerificationVisual] = useState<null | {
    kind: "mobile" | "email";
    phase: "verifying" | "success";
  }>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const afterAckRef = useRef<(() => void) | null>(null);
  const ackConsumedRef = useRef(false);
  const verifyStartedAtRef = useRef(0);
  const emailVerifyInFlightRef = useRef(false);
  const emailResendInFlightRef = useRef(false);
  const emailSendInFlightRef = useRef(false);
  const mobileVerifyInFlightRef = useRef(false);
  const autoVerifyHandledRef = useRef<string | null>(null);
  const reviewingRef = useRef(false);
  const [emailSendMachine, setEmailSendMachine] = useState<EmailOtpSendMachine>(() =>
    createEmailOtpSendMachine()
  );
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDiagnostic, setErrorDiagnostic] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [phoneAuthError, setPhoneAuthError] = useState<AppError | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (!cancelled) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const finishVerificationAck = useCallback(() => {
    if (ackConsumedRef.current) return;
    ackConsumedRef.current = true;
    const next = afterAckRef.current;
    afterAckRef.current = null;
    setVerificationVisual(null);
    next?.();
  }, []);

  const beginVerificationProcess = useCallback((kind: "mobile" | "email") => {
    verifyStartedAtRef.current = Date.now();
    ackConsumedRef.current = false;
    setVerificationVisual({ kind, phase: "verifying" });
  }, []);

  const abortVerificationProcess = useCallback(() => {
    afterAckRef.current = null;
    setVerificationVisual(null);
  }, []);

  const resolveVerificationSuccess = useCallback(
    (kind: "mobile" | "email", then: () => void) => {
      ackConsumedRef.current = false;
      afterAckRef.current = then;
      const minVisible = reduceMotion
        ? ONBOARDING_MIN_VERIFYING_REDUCED_MS
        : ONBOARDING_MIN_VERIFYING_VISIBLE_MS;
      const wait = Math.max(0, minVisible - (Date.now() - verifyStartedAtRef.current));
      const reveal = () => {
        onboardingMark(kind === "mobile" ? "mobileVerifiedUI" : "emailVerifiedUI");
        setVerificationVisual({ kind, phase: "success" });
      };
      if (wait === 0) reveal();
      else setTimeout(reveal, wait);
    },
    [reduceMotion]
  );

  const wrapWithAck = (node: React.ReactElement) => (
    <View style={{ flex: 1 }}>
      {node}
      {verificationVisual ? (
        <VerificationSuccessAck
          kind={verificationVisual.kind}
          phase={verificationVisual.phase}
          reducedMotion={reduceMotion}
          onDone={finishVerificationAck}
        />
      ) : null}
    </View>
  );

  const clearFlowError = useCallback(() => {
    setError(null);
    setErrorDiagnostic(null);
    setErrorTitle(null);
    setPhoneAuthError(null);
  }, []);

  const applyFlowError = useCallback((e: unknown) => {
    const appErr = e instanceof AppError ? e : null;
    const phase = resolveAuthFlowPhase(e);
    const isNativePhoneAuthFailure =
      Boolean(appErr?.details?.firebaseAuthCode) ||
      Boolean(appErr?.details?.redactedNativeMessage) ||
      appErr?.code === "otp_send_failed" ||
      appErr?.code === "otp_expired" ||
      appErr?.code === "invalid_otp" ||
      appErr?.code === "invalid_phone" ||
      appErr?.code === "too_many_attempts" ||
      appErr?.code === "auth_not_configured";
    // Prefer AppError.message for post-auth; keep sticky Firebase diagnostics for send/verify.
    const body =
      phase === "post_auth"
        ? userFacingMessage(e)
        : isNativePhoneAuthFailure
          ? formatPhoneAuthDisplayMessage(e)
          : userFacingMessage(e);
    setErrorTitle(authFlowErrorTitle(e));
    setError(body);
    setErrorDiagnostic(
      authFlowDiagnosticCode(e) || (appErr ? phoneAuthDiagnosticId(appErr) : null)
    );
    setPhoneAuthError(appErr);
  }, []);

  const copyPhoneAuthDiagnostics = useCallback(async () => {
    if (!phoneAuthError) return;
    try {
      await Clipboard.setStringAsync(formatPhoneAuthCopyDiagnostics(phoneAuthError));
    } catch {
      // Best-effort clipboard; ignore failures.
    }
  }, [phoneAuthError]);

  const { remainingSeconds: emailResendRemaining, canResend: emailCanResend } =
    useAuthoritativeResendCountdown(step === "email_verify" ? emailResendAvailableAt : null);
  const emailValidityRemaining = useAuthoritativeCountdown(
    step === "email_verify" ? emailExpiresAt : null
  );

  const goToBusinessIdentity = useCallback(() => {
    // Only user-directed Back/review may suppress this intentional continue.
    // Do NOT consult shouldSuppressForwardGuard here: that mount/boot helper
    // returns true for continueForward when memory still says emailOtp/emailEntry,
    // which would permanently no-op after a successful email verify (vc10 stuck
    // "Email verified" chip on email_verify with Verify disabled).
    if (isReviewIntentActive()) {
      return;
    }
    if (user) {
      markContinuingWizardStep("businessIdentity", user.uid, {
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
              clearWizardNavigationSession();
              await clearAuthWrapperProgress(uid);
              if (uid) await clearOnboardingProfileDraft(uid);
              await signOut();
              setStep("phone");
              setChallenge(null);
              setPhoneChallengeProven(false);
              setPhoneE164(null);
              setEmailDraft("");
              setEmailVerificationId(null);
              setEmailCode("");
              clearFlowError();
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

      // Sync-first: in-memory review intent wins over AsyncStorage and boot resolution.
      const mem = getWizardSnapshot();
      let reviewRequested =
        paramIntent === "review" ||
        paramFrom === "profile" ||
        isReviewIntentActive() ||
        mem.navigationIntent === "reviewPreviousStep";
      reviewingRef.current = Boolean(reviewRequested);

      const applyReviewUi = (logicalStep: string | undefined) => {
        if (!user) return;
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
        if (paramStep === "email_verify" || logicalStep === "emailOtp") {
          reviewUi = "email_verify";
        } else if (
          paramStep === "phone" ||
          logicalStep === "mobileEntry" ||
          logicalStep === "phoneConfirm" ||
          logicalStep === "phoneOtp"
        ) {
          reviewUi =
            logicalStep === "phoneOtp"
              ? "otp"
              : logicalStep === "phoneConfirm"
                ? "confirm"
                : "phone";
        } else {
          reviewUi = "email";
        }
        setStep(reviewUi);
        markReviewingWizardStep(uiStepToWizard(reviewUi), user.uid, {
          phoneE164: user.phoneE164,
          verifiedEmail: hasAuthoritativeVerifiedEmail(user)
            ? user.normalizedEmail ?? user.businessEmail
            : null,
        });
      };

      if (status === "signed_in" && user) {
        // OTP post-auth continuation owns navigation — do not race to Email
        // while verify/consent/bridge is still in flight.
        if (mobileVerifyInFlightRef.current) {
          if (!cancelled) setHydrated(true);
          return;
        }

        const onboardingIncomplete = isPreDashboardOnboardingIncomplete(user, {
          locationConsentShown: false,
        });

        // Fully past email+profile gates → leave auth wrapper (boot continues).
        if (hasAuthoritativeVerifiedEmail(user) && user.profileCompletedAt && !reviewRequested) {
          clearWizardNavigationSession();
          if (!cancelled) handoffToApp();
          return;
        }

        // Deliberate review of an earlier auth step — never bounce forward.
        if (reviewRequested) {
          applyReviewUi(mem.currentLogicalStep);
          if (!cancelled) setHydrated(true);
          return;
        }

        // Cold persistence only when memory has no active user-directed session.
        if (!mem.hasActiveSession && !mem.persistenceHydrated) {
          const generation = mem.transitionGeneration;
          const nav = await loadOnboardingNavigationState();
          if (cancelled) return;
          if (nav) {
            dispatchWizardNav({
              type: "HYDRATE_PERSISTENCE",
              state: nav,
              expectedGeneration: generation,
            });
            if (nav.intent === "reviewPreviousStep" || isReviewIntentActive()) {
              reviewRequested = true;
              reviewingRef.current = true;
              applyReviewUi(nav.currentStep);
              if (!cancelled) setHydrated(true);
              return;
            }
          } else {
            dispatchWizardNav({ type: "MARK_PERSISTENCE_HYDRATED" });
          }
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
          // Returning mid-onboarding: phone was already proven for this identity.
          setPhoneChallengeProven(Boolean(user.phoneE164));
          setStep("email");
          markContinuingWizardStep("emailEntry", user.uid, {
            phoneE164: user.phoneE164,
          });
          if (!cancelled) setHydrated(true);
          return;
        }

        // Email verified, profile still incomplete → profile route only if not reviewing.
        // Use review intent only (not shouldSuppressForwardGuard): a persisted
        // continueForward@emailOtp session must still advance after verify/restart.
        if (onboardingIncomplete) {
          if (isReviewIntentActive() || reviewingRef.current) {
            if (!cancelled) setHydrated(true);
            return;
          }
          if (!cancelled) goToBusinessIdentity();
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
        if (isBackBlockedDuringEmailSend(emailSendMachine)) {
          return true; // block while send in flight
        }
        setStep("email");
        setEmailCode("");
        setEmailSendMachine(createEmailOtpSendMachine());
        return true;
      }
      if (step === "email") {
        goBackFromEmail();
        return true;
      }
      return false;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, status, user, emailSendMachine]);

  const goBackFromEmail = () => {
    reviewingRef.current = true;
    // Sync review intent before UI step change — one logical Back.
    markReviewingWizardStep("mobileEntry", user?.uid ?? null, {
      phoneE164: user?.phoneE164 ?? phoneE164,
    });
    if (user?.phoneE164) {
      setPhoneE164(user.phoneE164);
      setPhoneDraft({
        countryCode: DEFAULT_AUTH_V2_COUNTRY_CODE,
        localNumber: localDigitsFromE164(user.phoneE164),
      });
      setTermsAccepted(true);
      setPrivacyAccepted(true);
    }
    clearFlowError();
    setStep("phone");
  };

  const beginPhoneChangeSession = async (nextE164: string) => {
    const previousUid = user?.uid;
    clearWizardNavigationSession();
    await clearAuthWrapperProgress(previousUid);
    if (previousUid) {
      await clearOnboardingProfileDraft(previousUid);
      const { clearOnboardingProfileDraftV2 } = await import(
        "@/onboarding/onboardingProfileDraftV2"
      );
      await clearOnboardingProfileDraftV2(previousUid);
    }
    if (status === "signed_in") {
      await signOut();
    }
    setPhoneChallengeProven(false);
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
    clearFlowError();
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
                    applyFlowError(err);
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
      applyFlowError(e);
    }
  };

  const handleConfirmSend = async () => {
    if (!termsAccepted || !privacyAccepted) return;
    // Keep any previous OTP-send error visible until success or a new failure replaces it.
    setLoading(true);
    onboardingMark("sendStarted");
    try {
      // Display + send must share one canonical E.164 from the confirmed draft.
      // Profile / prior challenge / stale native session must never select the target.
      const confirmedFromDraft = toE164FromDraft(
        phoneDraft.countryCode,
        phoneDraft.localNumber
      );
      const provenance = resolveFreshPhoneSendTarget({
        confirmedPhoneE164: confirmedFromDraft,
        statePhoneE164: phoneE164,
        profilePhoneE164: user?.phoneE164 ?? null,
        priorChallengePhoneE164: challenge?.phoneE164 ?? null,
      });
      assertPhoneSendProvenance(provenance);
      const sendPhone = provenance.firebaseSendPhoneE164;
      setPhoneE164(sendPhone);

      await savePendingConsent(sendPhone, "auth_v2_phone_confirm");
      const next = await sendOtpForWrapper(sendPhone);
      if (!phonesMatchE164(next.phoneE164, sendPhone)) {
        throw new AppError(
          "auth_failed",
          "Could not send the verification code because the confirmed number did not match the send target. Go back and confirm your mobile number again.",
          undefined,
          {
            authPhase: "send",
            failureDomain: "auth",
            diagnosticCode: "PHONE_SEND_TARGET_MISMATCH",
            confirmedPhoneSuffix: sendPhone.replace(/\D/g, "").slice(-4),
            challengePhoneSuffix: String(next.phoneE164).replace(/\D/g, "").slice(-4),
          }
        );
      }
      clearFlowError();
      setChallenge({ ...next, devCodeHint: null });
      setDevHint(null);
      setPhoneChallengeProven(false);
      autoVerifyHandledRef.current = null;
      setMobileExpiresAt(next.expiresAt ?? Date.now() + 10 * 60_000);
      setMobileResendAvailableAt(next.resendAvailableAt ?? Date.now() + 30_000);
      setMobileLockUntil(null);
      setMobileOtpDigits("");
      await saveAuthWrapperChallenge({
        phoneE164: next.phoneE164,
        verificationId: next.verificationId,
        devCodeHint: null,
      });
      onboardingMark("challengeReady");
      onboardingMeasure("sendStarted", "challengeReady", "sendStarted → challengeReady");
      setStep("otp");
      markContinuingWizardStep("phoneOtp", user?.uid ?? null, {
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
      applyFlowError(e);
    } finally {
      setLoading(false);
    }
  };

  const continueAfterPhoneProfile = useCallback(
    async (profile: import("@/domain/types").UserProfile) => {
      // Authoritative profile from confirm — do not wait for React session commit.
      // CRITICAL: do NOT clear `challenge` before leaving step "otp". Clearing first
      // leaves step==="otp" && !challenge across await gaps → false sessionExpired
      // fallthrough (Stage-8 clean-room / first_time_create).
      await applyServerProfile(profile);
      const consentPatch = await consentPatchForProfile(profile);
      let nextProfile = profile;
      if (consentPatch) {
        nextProfile = await updateProfile(consentPatch, { user: profile });
      }

      setPhoneChallengeProven(true);

      if (hasAuthoritativeVerifiedEmail(nextProfile) && nextProfile.profileCompletedAt) {
        await markAuthWrapperEmailComplete(nextProfile.uid);
        resolveVerificationSuccess("mobile", () => {
          void (async () => {
            clearWizardNavigationSession();
            await clearAuthWrapperChallenge();
            setChallenge(null);
            handoffToApp();
          })();
        });
        return;
      }

      if (hasAuthoritativeVerifiedEmail(nextProfile)) {
        await markAuthWrapperEmailComplete(nextProfile.uid);
        resolveVerificationSuccess("mobile", () => {
          void (async () => {
            goToBusinessIdentity();
            await clearAuthWrapperChallenge();
            setChallenge(null);
          })();
        });
        return;
      }

      await markAuthWrapperEmailPending(nextProfile.uid);
      setEmailDraft(nextProfile.businessEmail ?? "");
      markContinuingWizardStep("emailEntry", nextProfile.uid, {
        phoneE164: nextProfile.phoneE164,
      });
      resolveVerificationSuccess("mobile", () => {
        void (async () => {
          onboardingMeasure("mobileVerifiedUI", "emailScreenVisible", "mobileVerifiedUI → emailScreenVisible");
          setStep("email");
          await clearAuthWrapperChallenge();
          setChallenge(null);
          const { clearMobileOtpDigitSnapshot } = await import(
            "@/services/auth/mobileOtpSecureDigits"
          );
          await clearMobileOtpDigitSnapshot();
        })();
      });
    },
    [applyServerProfile, goToBusinessIdentity, handoffToApp, resolveVerificationSuccess, updateProfile]
  );

  const handleVerifyOtp = async (code: string) => {
    if (!challenge) return;
    if (mobileVerifyInFlightRef.current) return;
    mobileVerifyInFlightRef.current = true;
    clearFlowError();
    beginVerificationProcess("mobile");
    setLoading(true);
    try {
      const profile = await confirmOtp(challenge, code);
      if (
        phoneE164 &&
        profile.phoneE164 &&
        !phonesMatchE164(profile.phoneE164, phoneE164)
      ) {
        throw new AppError(
          "auth_failed",
          "This device signed in with a different mobile number than the one being verified. Sign out and start again.",
          undefined,
          {
            authPhase: "post_auth",
            diagnosticCode: "AUTH_PHONE_CHALLENGE_MISMATCH",
            failureDomain: "auth",
          }
        );
      }
      await continueAfterPhoneProfile(profile);
    } catch (e) {
      if (e instanceof AppError && e.code === "account_pending_deletion") {
        abortVerificationProcess();
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
      if (e instanceof AppError && e.code === "otp_expired") {
        setMobileOtpDigits("");
      }
      abortVerificationProcess();
      applyFlowError(e);
    } finally {
      setLoading(false);
      mobileVerifyInFlightRef.current = false;
    }
  };

  /** Post-auth identity retry — reuses Firebase session; does not resend SMS. */
  const handleRetryAccountSetup = async () => {
    if (!phoneE164) return;
    if (mobileVerifyInFlightRef.current) return;
    if (!getNativeAuthUid()) {
      applyFlowError(
        new AppError(
          "auth_failed",
          "Your phone sign-in is no longer active. Request a new verification code.",
          undefined,
          {
            authPhase: "post_auth",
            failureDomain: "auth",
            diagnosticCode: "RETRY_REQUIRES_NEW_OTP",
            firebaseUserPresent: false,
          }
        )
      );
      return;
    }
    mobileVerifyInFlightRef.current = true;
    clearFlowError();
    beginVerificationProcess("mobile");
    setLoading(true);
    try {
      const { callResolveOrCreateUserByPhone } = await import("@/services/auth/identityCallable");
      const { requireJsAuthSessionForFirestore } = await import("@/services/auth/jsAuthBridge");
      const result = await callResolveOrCreateUserByPhone(phoneE164);
      // Same readiness barrier as confirmOtp — never continue on a soft bridge miss.
      await requireJsAuthSessionForFirestore("retry_account_setup");
      await applyServerProfile(result.profile);
      await continueAfterPhoneProfile(result.profile);
    } catch (e) {
      abortVerificationProcess();
      applyFlowError(e);
    } finally {
      setLoading(false);
      mobileVerifyInFlightRef.current = false;
    }
  };

  // Challenge-scoped post-send instant verification only — never complete on
  // pre-existing/stale currentUser at OTP mount.
  useEffect(() => {
    if (step !== "otp" || !challenge) return;
    const attemptKey = challenge.verificationId;
    const tryInstantContinue = () => {
      if (autoVerifyHandledRef.current === attemptKey) return;
      if (mobileVerifyInFlightRef.current) return;
      const marker = observePostSendAuthForChallenge(challenge);
      if (!marker && !isChallengeAutoVerified(challenge)) return;
      autoVerifyHandledRef.current = attemptKey;
      void handleVerifyOtp("");
    };
    // If instant verification completed during send, marker may already exist.
    tryInstantContinue();
    const unsub = subscribeNativeAuthState(() => {
      tryInstantContinue();
    });
    return () => {
      unsub();
    };
    // handleVerifyOtp closes over challenge; rebind when challenge identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, challenge?.verificationId]);

  const handleResend = async () => {
    if (!challenge?.phoneE164) return;
    // Keep prior failure visible until this resend succeeds or a new failure replaces it.
    setResending(true);
    try {
      // Resend MUST target the active challenge phone — never profile / stale state.
      const provenance = resolveResendPhoneSendTarget({
        activeChallengePhoneE164: challenge.phoneE164,
        statePhoneE164: phoneE164,
      });
      assertPhoneSendProvenance(provenance);
      const sendPhone = provenance.firebaseSendPhoneE164;
      setPhoneE164(sendPhone);

      const next = await startOtp(sendPhone);
      if (!phonesMatchE164(next.phoneE164, sendPhone)) {
        throw new AppError(
          "auth_failed",
          "Could not resend the verification code for this challenge. Request a new code from the start.",
          undefined,
          {
            authPhase: "send",
            failureDomain: "auth",
            diagnosticCode: "PHONE_SEND_TARGET_MISMATCH",
          }
        );
      }
      clearFlowError();
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
        clearFlowError();
        return;
      }
      applyFlowError(e);
    } finally {
      setResending(false);
    }
  };

  const handleEmailContinue = async () => {
    const trimmed = emailDraft.trim().toLowerCase();
    if (!user) return;
    if (emailSendInFlightRef.current) return;
    clearFlowError();
    setEmailHint(null);

    // Same already-verified email — continue to profile without a new OTP.
    if (
      hasAuthoritativeVerifiedEmail(user) &&
      sameEmailAddress(trimmed, user.normalizedEmail ?? user.businessEmail ?? "")
    ) {
      goToBusinessIdentity();
      return;
    }

    // Navigate-first: dismiss keyboard, show OTP screen, send in background.
    Keyboard.dismiss();
    emailSendInFlightRef.current = true;
    const started = beginEmailOtpSend(emailSendMachine);
    const generation = started.generation;
    setEmailSendMachine(started);
    setEmailVerificationId(null);
    setEmailCode("");
    setStep("email_verify");
    reviewingRef.current = false;
    markContinuingWizardStep("emailOtp", user.uid, {
      phoneE164: user.phoneE164,
    });
    onboardingMark("emailScreenVisible");

    try {
      // Server startEmailVerification is authoritative for pending/cleared verified
      // state — never client-write emailStatus / emailVerifiedAt in production.
      const { verificationId, resendAvailableAt, expiresAt } =
        await startBusinessEmailVerification(user.uid, trimmed);

      const completed = completeEmailOtpSend(started, generation, {
        challengeId: verificationId,
        expiresAt: expiresAt ?? Date.now() + 15 * 60_000,
        resendAvailableAt: resendAvailableAt ?? Date.now() + 30_000,
      });
      if (!completed) {
        // Late response after abandonment — do not create a hidden challenge.
        return;
      }
      setEmailSendMachine(completed);
      setEmailVerificationId(verificationId);
      setEmailResendAvailableAt(resendAvailableAt ?? Date.now() + 30_000);
      setEmailExpiresAt(expiresAt ?? Date.now() + 15 * 60_000);
      setEmailHint(null);
    } catch (e) {
      if (e instanceof AppError && e.code === "email_otp_cooldown") {
        const until = authoritativeResendAvailableAt(e.details);
        if (until != null) setEmailResendAvailableAt(until);
        const completed = completeEmailOtpSend(started, generation, {
          challengeId: emailVerificationId ?? `cooldown_${generation}`,
          expiresAt: emailExpiresAt ?? Date.now() + 15 * 60_000,
          resendAvailableAt: until ?? Date.now() + 30_000,
        });
        // Cooldown means a prior challenge may still be valid — stay on OTP with failed send UX if no id.
        if (!emailVerificationId) {
          const failed = failEmailOtpSend(
            started,
            generation,
            "OTP could not be sent"
          );
          if (failed) setEmailSendMachine(failed);
        } else if (completed) {
          setEmailSendMachine(completed);
        }
        clearFlowError();
        return;
      }
      if (e instanceof AppError && e.code === "email_already_linked") {
        const failed = failEmailOtpSend(started, generation, e.message);
        if (failed) setEmailSendMachine(failed);
        applyFlowError(e);
        return;
      }
      if (e instanceof AppError && e.code === "email_pending_deletion") {
        const failed = failEmailOtpSend(started, generation, e.message);
        if (failed) setEmailSendMachine(failed);
        applyFlowError(e);
        return;
      }
      const sendFailure =
        e instanceof AppError
          ? e.message
          : "OTP could not be sent";
      const failed = failEmailOtpSend(started, generation, sendFailure);
      if (failed) setEmailSendMachine(failed);
      if (e instanceof AppError) {
        applyFlowError(e);
      } else {
        clearFlowError();
        setError(sendFailure);
      }
    } finally {
      emailSendInFlightRef.current = false;
    }
  };

  const handleEmailRetrySend = async () => {
    if (!user) return;
    if (emailSendInFlightRef.current) return;
    clearFlowError();
    emailSendInFlightRef.current = true;
    const started = beginEmailOtpSend(emailSendMachine);
    const generation = started.generation;
    setEmailSendMachine(started);
    try {
      const trimmed = emailDraft.trim().toLowerCase();
      const { verificationId, resendAvailableAt, expiresAt } =
        await startBusinessEmailVerification(user.uid, trimmed);
      const completed = completeEmailOtpSend(started, generation, {
        challengeId: verificationId,
        expiresAt: expiresAt ?? Date.now() + 15 * 60_000,
        resendAvailableAt: resendAvailableAt ?? Date.now() + 30_000,
      });
      if (!completed) return;
      setEmailSendMachine(
        setRetainedDigits(completed, emailSendMachine.retainedDigits || emailCode)
      );
      setEmailVerificationId(verificationId);
      setEmailResendAvailableAt(resendAvailableAt ?? Date.now() + 30_000);
      setEmailExpiresAt(expiresAt ?? Date.now() + 15 * 60_000);
    } catch (e) {
      const failed = failEmailOtpSend(
        started,
        generation,
        "OTP could not be sent"
      );
      if (failed) setEmailSendMachine(failed);
      applyFlowError(e);
    } finally {
      emailSendInFlightRef.current = false;
    }
  };

  const handleEmailResend = async () => {
    if (!user || !emailVerificationId || emailResendInFlightRef.current) return;
    if (emailResendAvailableAt != null && Date.now() < emailResendAvailableAt) return;
    emailResendInFlightRef.current = true;
    clearFlowError();
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
        clearFlowError();
        return;
      }
      applyFlowError(e);
    } finally {
      emailResendInFlightRef.current = false;
      setResending(false);
    }
  };

  const handleVerifyEmailCode = async () => {
    if (!user || emailCode.length !== EMAIL_OTP_LENGTH) return;
    if (!canVerifyEmailOtp(emailSendMachine) || !emailVerificationId) {
      clearFlowError();
      setError("Wait until the OTP is sent, then verify.");
      return;
    }
    if (emailVerifyInFlightRef.current) return;
    emailVerifyInFlightRef.current = true;
    clearFlowError();
    beginVerificationProcess("email");
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
      // Route after success settle — never before authoritative bind.
      // Mount/boot suppress guard must still not wrap this continue (vc10).
      resolveVerificationSuccess("email", () => {
        goToBusinessIdentity();
        setEmailCode("");
        setEmailVerificationId(null);
        setEmailSendMachine(createEmailOtpSendMachine());
      });
    } catch (e) {
      abortVerificationProcess();
      applyFlowError(e);
    } finally {
      emailVerifyInFlightRef.current = false;
      setLoading(false);
    }
  };

  // Auto-verify only when a challenge exists — never while sending.
  const lastAutoSubmittedEmailCodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (step !== "email_verify") return;
    if (emailCode.length < EMAIL_OTP_LENGTH) {
      lastAutoSubmittedEmailCodeRef.current = null;
      setEmailSendMachine((m) => setRetainedDigits(m, emailCode));
      return;
    }
    if (emailCode.length !== EMAIL_OTP_LENGTH) return;
    setEmailSendMachine((m) => setRetainedDigits(m, emailCode));
    if (!canVerifyEmailOtp(emailSendMachine)) return;
    if (lastAutoSubmittedEmailCodeRef.current === emailCode) return;
    lastAutoSubmittedEmailCodeRef.current = emailCode;
    void handleVerifyEmailCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on completed code + challenge only
  }, [emailCode, step, emailSendMachine.state, emailVerificationId]);

  const resetToPhone = async () => {
    setStep("phone");
    setChallenge(null);
    clearFlowError();
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
    markReviewingWizardStep("mobileEntry", user?.uid ?? null, {
      phoneE164: user?.phoneE164 ?? null,
    });
  };

  // Chip means THIS challenge (or completed registration identity) was proven —
  // not merely that some AuthProvider session exists.
  const emailVerifiedChip = hasAuthoritativeVerifiedEmail(user);

  const renderBranch = resolveAuthFlowGateRenderBranch({
    hydrated,
    status,
    step,
    challengePresent: Boolean(challenge),
    phoneE164Present: Boolean(phoneE164),
    mobileVerifyInFlight: mobileVerifyInFlightRef.current || loading,
  });

  if (renderBranch === "boot" || renderBranch === "otp_transition") {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (renderBranch === "phone_confirm" && (step === "phone" || step === "confirm")) {
    return wrapWithAck(
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
        onBackFromConfirm={() => {
          // Keep OTP-send failure visible after Edit / Back so diagnostics stay on screen.
          setStep("phone");
        }}
        onBack={undefined}
        loading={loading}
        error={error}
        errorTitle={errorTitle}
        errorDiagnostic={errorDiagnostic}
        onCopyErrorDiagnostics={() => void copyPhoneAuthDiagnostics()}
      />
    );
  }

  if (renderBranch === "otp" && challenge && phoneE164) {
    return wrapWithAck(
      <OtpVerificationScreen
        phoneE164={challenge.phoneE164}
        devCodeHint={null}
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
            clearFlowError();
            try {
              const { localMockCancelMobileOtp } = await import(
                "@/services/auth/localMockMobileOtp"
              );
              localMockCancelMobileOtp(phoneE164);
            } catch {
              // Cancel is best-effort — never block editing the number.
            }
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
        errorTitle={errorTitle}
        errorDiagnostic={errorDiagnostic}
        onCopyErrorDiagnostics={() => void copyPhoneAuthDiagnostics()}
        onRetryAccountSetup={
          canRetryAccountSetupWithoutSms(phoneAuthError)
            ? () => void handleRetryAccountSetup()
            : undefined
        }
      />
    );
  }

  if (renderBranch === "email_verify") {
    const sending = emailSendMachine.state === "sending";
    const sendFailed = emailSendMachine.state === "failed";
    const canVerify = canVerifyEmailOtp(emailSendMachine) && Boolean(emailVerificationId);
    return wrapWithAck(
      <EmailOtpScreen
        email={emailDraft.trim().toLowerCase()}
        code={emailCode}
        onCodeChange={setEmailCode}
        onVerify={() => void handleVerifyEmailCode()}
        onResend={() => void handleEmailResend()}
        onRetrySend={() => void handleEmailRetrySend()}
        onBack={() => {
          setStep("email");
          setEmailCode("");
          clearFlowError();
          void markReviewingWizardStep("emailEntry", user?.uid ?? null);
        }}
        sending={sending}
        sendFailed={sendFailed}
        loading={loading}
        resending={resending}
        canVerify={canVerify}
        resendRemaining={emailResendRemaining}
        canResend={emailCanResend}
        validityRemaining={emailValidityRemaining}
        expired={emailValidityRemaining <= 0 && Boolean(emailExpiresAt)}
        error={error}
      />
    );
  }

  if (step === "email") {
    return wrapWithAck(
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
        belowFooter={
          <Pressable
            onPress={abandonWizardAndSignOut}
            accessibilityRole="button"
            style={styles.signOutInFlow}
          >
            <Text style={styles.signOutLink}>Sign out and start again</Text>
          </Pressable>
        }
      />
    );
  }

  // phone_fallback — only claim session expiry when signed_out (or explicitly set).
  const claimExpired = phoneFallbackMayClaimSessionExpired({
    status,
    explicitSessionExpired: Boolean(
      phoneAuthError?.details?.diagnosticCode === "SESSION_EXPIRED" ||
        (error != null && error === t("errors.sessionExpired"))
    ),
  });
  return wrapWithAck(
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
      error={claimExpired ? t("errors.sessionExpired") : error}
      errorTitle={errorTitle}
      errorDiagnostic={errorDiagnostic}
      onCopyErrorDiagnostics={() => void copyPhoneAuthDiagnostics()}
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
  signOutInFlow: {
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  signOutLink: {
    ...typography.caption,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    textDecorationLine: "underline",
  },
});
