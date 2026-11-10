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
  markAuthWrapperEmailComplete,
  markAuthWrapperEmailPending,
  saveAuthWrapperChallenge,
} from "@/auth-v2/authWrapperProgress";
import { resumeSignedOutPhoneChallenge } from "@/auth-v2/signedOutChallengeResume";
import { phoneAuthCopy } from "@/auth-v2/phoneAuthCopy";
import {
  canUseOrdinaryEmailBinding,
  VERIFIED_EMAIL_CHANGE_SUPPORT_MESSAGE,
} from "@/auth-v2/verifiedEmailEditAvailability";
import {
  createPhoneAuthOperations,
  escapePhoneChallenge,
  isPhoneAttemptUnknown,
  leaveAuthenticatedPhoneChallenge,
  openRestoredPhoneChallenge,
  PHONE_CLEANUP_BOUND_MS,
  PHONE_NATIVE_SEND_BOUND_MS,
  submitPhoneResend,
  submitPhoneVerification,
} from "@/auth-v2/phoneAuthOperation";
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
  adoptRestoredPhoneChallenge,
  beginPhoneOtpSend,
  beginPhoneOtpVerify,
  completePhoneOtpSend,
  createPhoneOtpChallengeMachine,
  failPhoneOtpSend,
  finishPhoneOtpVerify,
  isCurrentPhoneChallenge,
  retirePhoneChallenge,
} from "@/auth/phoneOtpChallengeMachine";
import {
  isAuthoritativeMobileVerified,
  resolveAuthSystemBackAction,
  resolveEmailAuthBackPolicy,
} from "@/auth/verifiedCheckpointPolicy";
import {
  getNativeAuthUid,
  isChallengeAutoVerified,
  observePostSendAuthForChallenge,
  restorePendingPhoneSessionForResume,
  recoverUnsettledNativeConfirm,
  recoverUnsettledNativeSend,
  retireDispatchedNativeConfirm,
  retireDispatchedNativeSend,
  subscribeNativeAuthState,
} from "@/services/auth/nativePhoneAuth";
import { phonesMatchE164 } from "@/services/auth/phoneChallengeAuthInvariant";
import {
  assertPhoneSendProvenance,
  resolveFreshPhoneSendTarget,
  resolveResendPhoneSendTarget,
} from "@/services/auth/phoneSendProvenance";
import {
  presentedPhoneResend,
  sharedPhoneResendDeadline,
} from "@/services/auth/phoneVerificationPlan";
import { formatDisplayPhone } from "@/utils/phone";
import { routeAccountSetupFailure } from "@/services/auth/reactivationRouting";
import {
  beginSessionCommit,
  currentAuthMutationGeneration,
  currentSessionCommitEpoch,
} from "@/services/auth/authSessionFence";
import {
  DEFAULT_AUTH_V2_COUNTRY_CODE,
  type AuthV2PhoneDraft,
  type AuthV2Step,
} from "@/auth-v2/types";
import { toE164FromDraft } from "@/auth-v2/phoneValidation";
import { AppError } from "@/domain/errors";
import { toPublicError } from "@/domain/publicErrors";
import { reportAuthFailure } from "@/services/auth/authStageTiming";
import {
  authFlowDiagnosticCode,
  authFlowErrorTitle,
  canRetryAccountSetupWithoutSms,
  resolveAuthFlowPhase,
} from "@/services/auth/authFlowErrorPresentation";
import {
  errorVisibleOnSurface,
  resolveAuthErrorSurface,
  type AuthTransientErrorSurface,
} from "@/services/auth/authFlowErrorOwnership";
import { shouldShowAuthDiagnosticsInUi } from "@/services/auth/authDiagnosticsGate";
import { authPerfMark, authPerfSummary } from "@/services/auth/authFlowPerf";
import { createLogger } from "@/utils/logger";
import {
  formatPhoneAuthCopyDiagnostics,
  formatPhoneAuthDisplayMessage,
  phoneAuthDiagnosticId,
} from "@/services/auth/nativePhoneAuthErrors";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "@/state/auth";
import { useI18n, useT } from "@/i18n";
import { savePendingConsent } from "@/services/consent/legalConsentService";
import { persistDeferredPhoneConsent } from "@/services/consent/deferredConsentPersist";
import {
  continueAfterPhoneProfileTransition,
  phoneProfileOwnershipHeld,
  retryAuthenticatedAccountSetup,
  type PhoneProfileOwnership,
} from "@/auth-v2/phoneProfileContinuation";
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
  type OnboardingWizardStep,
} from "@/auth/onboardingWizard";
import {
  resolveVerifiedEmailContinueAction,
} from "@/auth-v2/verifiedEmailContinue";
import { presentEmailOtpSendError } from "@/services/auth/presentEmailOtpSendError";
import {
  useAuthoritativeCountdown,
  useAuthoritativeResendCountdown,
} from "@/hooks/useAuthoritativeResendCountdown";
import { spacing, typography } from "@/theme";
import type { OtpChallenge } from "@/services/auth/types";
import { EMAIL_OTP_LENGTH } from "@/services/auth/emailOtpConstants";

const authFlowLog = createLogger("auth/flowGate");
const phoneAuthLog = createLogger("auth/nativePhone");

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
  const { lang } = useI18n();
  const copy = phoneAuthCopy(lang);
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
  const [phoneOtpRestored, setPhoneOtpRestored] = useState(false);
  const [verificationVisual, setVerificationVisual] = useState<null | {
    kind: "mobile" | "email";
    phase: "verifying" | "success";
  }>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const afterAckRef = useRef<(() => void) | null>(null);
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [errorSurface, setErrorSurface] = useState<AuthTransientErrorSurface | null>(null);
  const [phoneAuthError, setPhoneAuthError] = useState<AppError | null>(null);
  const [otpFormEpoch, setOtpFormEpoch] = useState(0);
  const phoneOtpRef = useRef(createPhoneOtpChallengeMachine());
  const phoneOpsRef = useRef(createPhoneAuthOperations());
  const phoneOpIdRef = useRef<string | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;
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
    if (kind === "mobile") authPerfMark("V1_verifying_overlay");
    setVerificationVisual({ kind, phase: "verifying" });
  }, []);

  const abortVerificationProcess = useCallback(() => {
    if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
    ackTimerRef.current = null;
    afterAckRef.current = null;
    setVerificationVisual(null);
  }, []);

  const resolveVerificationSuccess = useCallback(
    (kind: "mobile" | "email", then: () => void, stillCurrent: () => boolean = () => true) => {
      ackConsumedRef.current = false;
      afterAckRef.current = then;
      const minVisible = reduceMotion
        ? ONBOARDING_MIN_VERIFYING_REDUCED_MS
        : ONBOARDING_MIN_VERIFYING_VISIBLE_MS;
      const wait = Math.max(0, minVisible - (Date.now() - verifyStartedAtRef.current));
      const reveal = () => {
        ackTimerRef.current = null;
        if (!stillCurrent()) return;
        onboardingMark(kind === "mobile" ? "mobileVerifiedUI" : "emailVerifiedUI");
        setVerificationVisual({ kind, phase: "success" });
      };
      if (wait === 0) reveal();
      else ackTimerRef.current = setTimeout(reveal, wait);
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
    setErrorSurface(null);
    setPhoneAuthError(null);
  }, []);

  const applyFlowError = useCallback((e: unknown, surface?: AuthTransientErrorSurface) => {
    const appErr = e instanceof AppError ? e : null;
    const phase = resolveAuthFlowPhase(e);
    const nextSurface =
      surface ??
      resolveAuthErrorSurface({
        step: stepRef.current,
        phase,
      });
    const isNativePhoneAuthFailure =
      Boolean(appErr?.details?.firebaseAuthCode) ||
      Boolean(appErr?.details?.redactedNativeMessage) ||
      appErr?.code === "otp_send_failed" ||
      appErr?.code === "otp_expired" ||
      appErr?.code === "invalid_otp" ||
      appErr?.code === "invalid_phone" ||
      appErr?.code === "too_many_attempts" ||
      appErr?.code === "auth_not_configured";
    const body = isNativePhoneAuthFailure
      ? formatPhoneAuthDisplayMessage(e)
      : toPublicError(e, phase === "post_auth" ? "account" : "phone").message;
    reportAuthFailure(e, phase === "post_auth" ? "SESSION_PUBLISH" : "LOCAL_KEY_READY");
    authFlowLog.warn("auth_flow_error", {
      surface: nextSurface,
      phase,
      appCode: appErr?.code ?? "unknown",
      diagnosticCode: authFlowDiagnosticCode(e),
      firebaseAuthCode:
        typeof appErr?.details?.firebaseAuthCode === "string"
          ? appErr.details.firebaseAuthCode
          : null,
      callableName:
        typeof appErr?.details?.callableName === "string" ? appErr.details.callableName : null,
    });
    setErrorSurface(nextSurface);
    setErrorTitle(authFlowErrorTitle(e));
    setError(body);
    setErrorDiagnostic(
      shouldShowAuthDiagnosticsInUi()
        ? authFlowDiagnosticCode(e) || (appErr ? phoneAuthDiagnosticId(appErr) : null)
        : null
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

  const goToBusinessIdentity = useCallback(
    (opts?: { userInitiated?: boolean }) => {
      // Hydration/boot must not steal a review session. User Continue must proceed.
      if (!opts?.userInitiated && isReviewIntentActive()) {
        return;
      }
      if (user) {
        markContinuingWizardStep("businessIdentity", user.uid, {
          phoneE164: user.phoneE164,
          verifiedEmail: user.normalizedEmail ?? user.businessEmail,
        });
      }
      router.replace("/(auth)/complete-profile");
    },
    [router, user]
  );

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
              phoneOtpRef.current = createPhoneOtpChallengeMachine();
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
          setEmailVerificationId(null);
          setEmailCode("");
          setEmailSendMachine(createEmailOtpSendMachine());
          if (user.phoneE164) {
            setPhoneE164(user.phoneE164);
            setPhoneDraft({
              countryCode: DEFAULT_AUTH_V2_COUNTRY_CODE,
              localNumber: localDigitsFromE164(user.phoneE164),
            });
          }
          // Returning mid-onboarding: phone was already proven for this identity.
          setPhoneChallengeProven(Boolean(user.phoneE164));
          clearFlowError();
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

      const launchGeneration = phoneOtpRef.current.generation;
      const resumed = await resumeSignedOutPhoneChallenge({
        isCurrent: () => !cancelled && phoneOtpRef.current.generation === launchGeneration,
      });
      if (!cancelled && phoneOtpRef.current.generation === launchGeneration && resumed.action === "resume") {
        const restored = await restorePendingPhoneSessionForResume(resumed.verificationId, resumed.phoneE164);
        const opened = openRestoredPhoneChallenge({
          action: resumed.action,
          restored,
          expiresAt: resumed.expiresAt,
          resendAvailableAt: resumed.resendAvailableAt,
          now: Date.now(),
        });
        const adopted = opened.openOtp
          ? adoptRestoredPhoneChallenge(phoneOtpRef.current, resumed.verificationId)
          : phoneOtpRef.current;
        if (
          opened.openOtp &&
          adopted.verificationId === resumed.verificationId &&
          adopted.generation > 0 &&
          !cancelled &&
          phoneOtpRef.current.generation === launchGeneration
        ) {
          phoneOtpRef.current = adopted;
          const deadline = sharedPhoneResendDeadline(opened.resendAvailableAt, Date.now());
          setPhoneE164(resumed.phoneE164);
          setChallenge({
            verificationId: resumed.verificationId,
            phoneE164: resumed.phoneE164,
            devCodeHint: resumed.devCodeHint,
            resendAvailableAt: deadline,
            expiresAt: opened.expiresAt ?? undefined,
          });
          setMobileResendAvailableAt(deadline);
          setMobileExpiresAt(opened.expiresAt);
          setPhoneOtpRestored(true);
          setDevHint(resumed.devCodeHint);
          setStep("otp");
          setPhoneDraft({
            countryCode: DEFAULT_AUTH_V2_COUNTRY_CODE,
            localNumber: localDigitsFromE164(resumed.phoneE164),
          });
        } else if (!cancelled && phoneOtpRef.current.generation === launchGeneration && !phoneOpsRef.current.view().busy) {
          setPhoneOtpRestored(false);
          const inspected = { phoneE164: resumed.phoneE164, verificationId: resumed.verificationId };
          void escapePhoneChallenge({
            ops: phoneOpsRef.current,
            clear: () =>
              clearAuthWrapperChallenge(inspected, () => phoneOtpRef.current.generation === launchGeneration),
          });
        }
      } else if (!cancelled) {
        setPhoneOtpRestored(false);
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

  // Hardware Back — verified checkpoints never regress to Phone Entry.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      const mobileVerified = isAuthoritativeMobileVerified({
        phoneChallengeProven,
        signedIn: status === "signed_in",
        profilePhoneE164: user?.phoneE164 ?? phoneE164,
      });
      const emailBackPolicy = resolveEmailAuthBackPolicy({
        mobileAuthoritativelyVerified: mobileVerified,
        reviewingFromProfile:
          reviewingRef.current && (paramFrom === "profile" || paramIntent === "review"),
      });
      const action = resolveAuthSystemBackAction({
        step,
        mobileAuthoritativelyVerified: mobileVerified,
        emailBackPolicy,
        emailSendBlocked: isBackBlockedDuringEmailSend(emailSendMachine),
      });
      if (action === "allow_os") return false;
      if (action === "stay") return true;
      if (action === "phone_unverified") {
        if (step === "confirm") {
          setStep("phone");
          return true;
        }
        resetToPhone();
        return true;
      }
      if (action === "email_from_email_otp") {
        setStep("email");
        setEmailCode("");
        setEmailSendMachine(createEmailOtpSendMachine());
        clearFlowError();
        return true;
      }
      if (action === "profile_review") {
        goToBusinessIdentity({ userInitiated: true });
        return true;
      }
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    step,
    status,
    user,
    emailSendMachine,
    phoneChallengeProven,
    phoneE164,
    challenge,
    paramFrom,
    paramIntent,
  ]);

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
              phoneOtpRef.current = createPhoneOtpChallengeMachine();
              setChallenge(null);
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
    const accepted = phoneOpsRef.current.accept("send", PHONE_NATIVE_SEND_BOUND_MS);
    if (!accepted.accepted) return;
    const started = beginPhoneOtpSend(phoneOtpRef.current);
    if (!started) {
      phoneOpsRef.current.settle(accepted.id, "off");
      return;
    }
    phoneOtpRef.current = started;
    const generation = started.generation;
    phoneOpIdRef.current = accepted.id;
    setLoading(true);
    authPerfMark("T0_continue_tap");
    authPerfMark("T1_local_validation");
    onboardingMark("sendStarted");
    const stillSend = () =>
      isCurrentPhoneChallenge(phoneOtpRef.current, generation) &&
      phoneOpsRef.current.sameAttempt(accepted.id);
    try {
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

      authPerfMark("T2_native_send_begin");
      void savePendingConsent(sendPhone, "auth_v2_phone_confirm");
      const sendWork = sendOtpForWrapper(sendPhone);
      const boundedSend = await phoneOpsRef.current.bounded(
        accepted.id,
        sendWork,
        PHONE_NATIVE_SEND_BOUND_MS
      );
      if (boundedSend.status === "unknown") {
        void sendWork.then(
          () => undefined,
          () => undefined
        );
        retireDispatchedNativeSend();
        phoneOpsRef.current.settle(accepted.id, "off");
        const failed = failPhoneOtpSend(phoneOtpRef.current, generation);
        if (failed) phoneOtpRef.current = failed;
        if (isCurrentPhoneChallenge(phoneOtpRef.current, generation)) {
          applyFlowError(
            new AppError("otp_send_failed", copy.resultUnknown, undefined, { phoneAuthSettlement: "unknown" }),
            "phone"
          );
        }
        return;
      }
      if (boundedSend.status !== "ok" || !stillSend()) return;
      const next = boundedSend.value;
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
      const completed = completePhoneOtpSend(
        phoneOtpRef.current,
        generation,
        next.verificationId
      );
      if (completed) phoneOtpRef.current = completed;
      authPerfMark("T3_firebase_challenge");
      clearFlowError();
      const expiresAt =
        typeof next.expiresAt === "number" && Number.isFinite(next.expiresAt) ? next.expiresAt : null;
      const deadline = sharedPhoneResendDeadline(next.resendAvailableAt ?? null, Date.now());
      setChallenge({
        ...next,
        devCodeHint: null,
        resendAvailableAt: deadline,
        expiresAt: expiresAt ?? undefined,
      });
      setDevHint(null);
      setPhoneChallengeProven(false);
      setPhoneOtpRestored(false);
      autoVerifyHandledRef.current = null;
      setMobileExpiresAt(expiresAt);
      setMobileResendAvailableAt(deadline);
      setMobileLockUntil(null);
      setMobileOtpDigits("");
      setOtpFormEpoch((n) => n + 1);
      authPerfMark("T4_otp_screen_requested");
      setStep("otp");
      onboardingMark("challengeReady");
      onboardingMeasure("sendStarted", "challengeReady", "sendStarted → challengeReady");
      authPerfSummary("phone_send", [
        ["T0_continue_tap", "T1_local_validation", "local_validation_ms"],
        ["T2_native_send_begin", "T3_firebase_challenge", "firebase_send_ms"],
        ["T0_continue_tap", "T4_otp_screen_requested", "tap_to_otp_screen_ms"],
      ]);
      void savePendingConsent(sendPhone, "auth_v2_phone_confirm");
      void saveAuthWrapperChallenge(
        {
          phoneE164: next.phoneE164,
          verificationId: next.verificationId,
          devCodeHint: null,
        },
        stillSend
      );
      void markContinuingWizardStep("phoneOtp", user?.uid ?? null, {
        phoneE164: next.phoneE164,
      });
      if (expiresAt != null) {
        void import("@/services/auth/mobileOtpSecureDigits").then(({ saveMobileOtpDigitSnapshot }) =>
          saveMobileOtpDigitSnapshot(
            {
              phoneE164: next.phoneE164,
              verificationId: next.verificationId,
              digits: "",
              expiresAt,
              resendAvailableAt: deadline,
            },
            stillSend
          )
        );
      }
      phoneOpsRef.current.settle(accepted.id, "off");
    } catch (e) {
      if (phoneOpsRef.current.sameAttempt(accepted.id)) phoneOpsRef.current.settle(accepted.id, "off");
      const failed = failPhoneOtpSend(phoneOtpRef.current, generation);
      if (failed) phoneOtpRef.current = failed;
      if (!isCurrentPhoneChallenge(phoneOtpRef.current, generation)) return;
      applyFlowError(e, "phone");
    } finally {
      if (phoneOtpRef.current.generation === generation) {
        setLoading(false);
      }
    }
  };

  const continueAfterPhoneProfile = useCallback(
    async (
      profile: import("@/domain/types").UserProfile,
      ownership?: PhoneProfileOwnership
    ) => {
      authPerfMark("V7_session_reconcile_begin");
      // Authoritative profile from confirm — do not wait for React session commit.
      // CRITICAL: do NOT clear `challenge` before leaving step "otp". Clearing first
      // leaves step==="otp" && !challenge across await gaps → false sessionExpired
      // fallthrough (Stage-8 clean-room / first_time_create).
      // Retry passes the ownership captured before resolution. A later generation
      // must not legitimise that earlier profile.
      const ownedGeneration = ownership?.generation ?? currentAuthMutationGeneration();
      const ownedEpoch = ownership?.epoch;
      const attemptId = phoneOpIdRef.current;
      const ownedChallenge = challenge
        ? { phoneE164: challenge.phoneE164, verificationId: challenge.verificationId }
        : null;
      const attemptCurrent = () =>
        (attemptId == null || phoneOpsRef.current.sameAttempt(attemptId)) &&
        currentAuthMutationGeneration() === ownedGeneration &&
        (ownedEpoch == null || currentSessionCommitEpoch() === ownedEpoch);
      const readLiveUid = () => {
        if (!attemptCurrent()) return null;
        return getNativeAuthUid();
      };
      const liveOwnership = () => ({
        uid: readLiveUid(),
        generation: currentAuthMutationGeneration(),
      });
      if (!attemptCurrent()) throw new Error("session_changed");
      if (ownership && !phoneProfileOwnershipHeld(ownership, liveOwnership(), profile.uid)) {
        throw new Error("session_changed");
      }
      await applyServerProfile(profile, ownedGeneration, readLiveUid, ownedEpoch);
      if (!attemptCurrent()) throw new Error("session_changed");
      if (ownership && !phoneProfileOwnershipHeld(ownership, liveOwnership(), profile.uid)) {
        throw new Error("session_changed");
      }
      const nextProfile = profile;
      const route =
        hasAuthoritativeVerifiedEmail(nextProfile) && nextProfile.profileCompletedAt
          ? "app"
          : hasAuthoritativeVerifiedEmail(nextProfile)
            ? "business"
            : "email";
      await continueAfterPhoneProfileTransition({
        route,
        startDeferredConsent: () =>
          persistDeferredPhoneConsent({
            profile,
            generationAtStart: ownedGeneration,
            sessionUid: () => getNativeAuthUid(),
            updateProfile: (patch) => updateProfile(patch, { user: profile, ownedGeneration }),
          }),
        onDeferredConsentRejected: (error: unknown) => {
          authFlowLog.warn("deferred consent persist rejected", {
            name: error instanceof Error ? error.name : "Error",
          });
        },
        markPhoneProven: () => setPhoneChallengeProven(true),
        markEmailComplete: () => markAuthWrapperEmailComplete(nextProfile.uid),
        markEmailPending: () => markAuthWrapperEmailPending(nextProfile.uid),
        prepareEmailScreen: () => {
          setEmailDraft(nextProfile.businessEmail ?? "");
          markContinuingWizardStep("emailEntry", nextProfile.uid, {
            phoneE164: nextProfile.phoneE164,
          });
          clearFlowError();
          setMobileOtpDigits("");
          setOtpFormEpoch((n) => n + 1);
          authPerfMark("V8_session_reconciled");
        },
        scheduleAfterAcknowledgement: (navigate) => {
          resolveVerificationSuccess("mobile", navigate, attemptCurrent);
        },
        navigateToApp: () => {
          void leaveAuthenticatedPhoneChallenge({
            stillCurrent: attemptCurrent,
            boundMs: PHONE_CLEANUP_BOUND_MS,
            navigate: () => {
              clearWizardNavigationSession();
              handoffToApp();
              if (attemptCurrent()) setChallenge(null);
            },
            clear: () => clearAuthWrapperChallenge(ownedChallenge, attemptCurrent),
          });
        },
        navigateToBusiness: () => {
          void leaveAuthenticatedPhoneChallenge({
            stillCurrent: attemptCurrent,
            boundMs: PHONE_CLEANUP_BOUND_MS,
            navigate: () => {
              goToBusinessIdentity({ userInitiated: true });
              if (attemptCurrent()) setChallenge(null);
            },
            clear: () => clearAuthWrapperChallenge(ownedChallenge, attemptCurrent),
          });
        },
        navigateToEmail: () => {
          void leaveAuthenticatedPhoneChallenge({
            stillCurrent: attemptCurrent,
            boundMs: PHONE_CLEANUP_BOUND_MS,
            navigate: () => {
              authPerfMark("V9_email_nav_requested");
              authPerfMark("V10_email_screen_requested");
              onboardingMeasure(
                "mobileVerifiedUI",
                "emailScreenVisible",
                "mobileVerifiedUI → emailScreenVisible"
              );
              authPerfSummary("otp_verify", [
                ["V0_otp_complete", "V1_verifying_overlay", "overlay_ms"],
                ["V2_firebase_confirm_begin", "V3_firebase_auth_ok", "firebase_confirm_ms"],
                ["V5_resolver_begin", "V6_resolver_ok", "resolver_ms"],
                ["V7_session_reconcile_begin", "V8_session_reconciled", "session_ms"],
                ["V0_otp_complete", "V9_email_nav_requested", "otp_to_email_nav_ms"],
              ]);
              setStep("email");
              if (attemptCurrent()) setChallenge(null);
            },
            clear: async () => {
              await clearAuthWrapperChallenge(ownedChallenge, attemptCurrent);
              if (!attemptCurrent()) return;
              const { clearMobileOtpDigitSnapshot } = await import(
                "@/services/auth/mobileOtpSecureDigits"
              );
              await clearMobileOtpDigitSnapshot(ownedChallenge, attemptCurrent);
            },
          });
        },
      });
    },
    [applyServerProfile, challenge, goToBusinessIdentity, handoffToApp, resolveVerificationSuccess, updateProfile]
  );

  const handleVerifyOtp = async (code: string) => {
    if (!challenge) return;
    const generation = phoneOtpRef.current.generation;
    const locked = beginPhoneOtpVerify(phoneOtpRef.current, generation);
    if (!locked) return;
    phoneOtpRef.current = locked;
    const submitted = code;
    const ownedChallenge = challenge;
    let operationId = "";
    const view = await submitPhoneVerification({
      ops: phoneOpsRef.current,
      code: submitted,
      phoneE164: ownedChallenge.phoneE164,
      confirm: () => {
        authPerfMark("V2_firebase_confirm_begin");
        const deadlineAt = phoneOpsRef.current.attemptDeadline(phoneOpIdRef.current ?? "");
        return confirmOtp(
          ownedChallenge,
          submitted,
          deadlineAt == null ? undefined : { deadlineAt }
        );
      },
      onAccepted: (acceptedId) => {
        operationId = acceptedId;
        phoneOpIdRef.current = acceptedId;
        mobileVerifyInFlightRef.current = true;
        clearFlowError();
        authPerfMark("V0_otp_complete");
        authPerfMark("V1_verifying_overlay");
        beginVerificationProcess("mobile");
        setLoading(true);
        phoneAuthLog.warn("phone auth operation", {
          attemptId: acceptedId,
          kind: "retryable",
          ms: 0,
        });
      },
      continueAccount: async (profile) => {
        if (
          !isCurrentPhoneChallenge(phoneOtpRef.current, generation) ||
          !phoneOpsRef.current.sameAttempt(operationId)
        ) {
          return { navigate: null, settlement: "session_changed" };
        }
        authPerfMark("V3_firebase_auth_ok");
        if (phoneE164 && profile.phoneE164 && !phonesMatchE164(profile.phoneE164, phoneE164)) {
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
        const ownership = {
          uid: profile.uid,
          generation: currentAuthMutationGeneration(),
          epoch: currentSessionCommitEpoch(),
        };
        try {
          await continueAfterPhoneProfile(profile, ownership);
          return { navigate: "account" as const };
        } catch (error) {
          if (!isCurrentPhoneChallenge(phoneOtpRef.current, generation)) {
            return { navigate: null, settlement: "session_changed" as const, error };
          }
          if (!phoneOpsRef.current.sameAttempt(operationId)) {
            return { navigate: null, settlement: "session_changed" as const, error };
          }
          if (error instanceof Error && error.message === "session_changed") {
            return { navigate: null, settlement: "session_changed" as const, error };
          }
          const pendingRoute = routeAccountSetupFailure({
            error,
            stillCurrent: true,
            fallbackPhoneE164: String(ownedChallenge.phoneE164),
          });
          if (pendingRoute.kind === "stale") {
            return { navigate: null, settlement: "session_changed" as const, error };
          }
          if (pendingRoute.kind === "reactivation") {
            return {
              navigate: "reactivation" as const,
              reactivation: {
                phoneE164: pendingRoute.params.phoneE164,
                deletionScheduledFor: pendingRoute.params.deletionScheduledFor,
                deletionPolicyVersion: pendingRoute.params.deletionPolicyVersion,
                maskedEmail: pendingRoute.params.maskedEmail,
              },
            };
          }
          throw error;
        }
      },
    });
    const finished = finishPhoneOtpVerify(phoneOtpRef.current, generation);
    if (finished) phoneOtpRef.current = finished;
    if (!view.applied) return;
    if (!phoneOpsRef.current.sameAttempt(view.operationId)) return;
    if (view.overlay === "off") abortVerificationProcess();
    setLoading(false);
    mobileVerifyInFlightRef.current = false;
    if (view.clearCode) {
      setMobileOtpDigits("");
      setOtpFormEpoch((n) => n + 1);
    }
    if (view.settlement === "unknown") {
      autoVerifyHandledRef.current = ownedChallenge.verificationId;
      retireDispatchedNativeSend();
      retireDispatchedNativeConfirm();
      beginSessionCommit();
      phoneOpsRef.current.retire();
      applyFlowError(
        new AppError("otp_send_failed", copy.resultUnknown, undefined, { phoneAuthSettlement: "unknown" }),
        "phone_otp"
      );
    } else if (view.settlement === "session_changed") {
      applyFlowError(new AppError("session_expired", copy.sessionChanged), "phone_otp");
    } else if (view.settlement === "invalid" || view.settlement === "expired" || view.settlement === "network") {
      const error = view.error instanceof AppError ? view.error : new AppError("invalid_otp", copy.resultUnknown);
      if (error instanceof AppError && error.code === "too_many_attempts") {
        const until = error.details?.lockUntil;
        if (typeof until === "number") setMobileLockUntil(until);
      }
      applyFlowError(error, "phone_otp");
    } else if (view.settlement === "account_failed") {
      const base = view.error instanceof AppError ? view.error : null;
      applyFlowError(
        new AppError(
          base?.code ?? "save_failed",
          base?.message || copy.accountSetupFailed,
          base ?? undefined,
          {
            ...(base?.details ?? {}),
            authPhase: "post_auth",
            firebaseSignInSucceeded: true,
            retryAccountSetup: true,
          }
        ),
        "phone_otp"
      );
    }
    if (
      view.navigate === "reactivation" &&
      view.reactivation &&
      isCurrentPhoneChallenge(phoneOtpRef.current, generation)
    ) {
      abortVerificationProcess();
      router.replace({
        pathname: "/(auth)/account-pending-deletion",
        params: view.reactivation,
      });
    }
  };

  /** Post-auth identity retry — reuses Firebase session; does not resend SMS. */
  const handleRetryAccountSetup = async () => {
    await retryAuthenticatedAccountSetup({
      ops: phoneOpsRef.current,
      phoneE164,
      inFlight: mobileVerifyInFlightRef.current,
      captureEpoch: () => beginSessionCommit(),
      readLive: () => ({
        uid: getNativeAuthUid(),
        generation: currentAuthMutationGeneration(),
        epoch: currentSessionCommitEpoch(),
      }),
      begin: () => {
        mobileVerifyInFlightRef.current = true;
        clearFlowError();
        beginVerificationProcess("mobile");
        setLoading(true);
      },
      end: () => {
        setLoading(false);
        mobileVerifyInFlightRef.current = false;
      },
      resolveAccount: async (phone) => {
        const { callResolveOrCreateUserByPhone } = await import("@/services/auth/identityCallable");
        return callResolveOrCreateUserByPhone(phone);
      },
      requireBridge: async () => {
        const { requireJsAuthSessionForFirestore } = await import("@/services/auth/jsAuthBridge");
        // Same readiness barrier as confirmOtp — never continue on a soft bridge miss.
        await requireJsAuthSessionForFirestore("retry_account_setup");
      },
      applyServerProfile: (next, ownership) =>
        applyServerProfile(
          next,
          ownership.generation,
          () => {
            if (ownership.epoch != null && currentSessionCommitEpoch() !== ownership.epoch) return null;
            return getNativeAuthUid();
          },
          ownership.epoch
        ),
      continueAfterProfile: (next, ownership) => continueAfterPhoneProfile(next, ownership),
      onInactiveSession: () => {
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
      },
      onFailure: (error) => {
        const pendingRoute = routeAccountSetupFailure({
          error,
          stillCurrent:
            phoneOpIdRef.current == null || phoneOpsRef.current.sameAttempt(phoneOpIdRef.current),
          fallbackPhoneE164: phoneE164 ?? "",
        });
        if (pendingRoute.kind === "stale") return;
        if (pendingRoute.kind === "reactivation") {
          abortVerificationProcess();
          router.replace({
            pathname: "/(auth)/account-pending-deletion",
            params: {
              phoneE164: pendingRoute.params.phoneE164,
              deletionScheduledFor: pendingRoute.params.deletionScheduledFor,
              deletionPolicyVersion: pendingRoute.params.deletionPolicyVersion,
              maskedEmail: pendingRoute.params.maskedEmail,
            },
          });
          return;
        }
        abortVerificationProcess();
        if (isPhoneAttemptUnknown(error)) {
          applyFlowError(
            new AppError("otp_send_failed", copy.resultUnknown, undefined, { phoneAuthSettlement: "unknown" }),
            "phone_otp"
          );
          return;
        }
        applyFlowError(error, "phone_otp");
      },
    });
  };

  // Challenge-scoped post-send instant verification only — never complete on
  // pre-existing/stale currentUser at OTP mount.
  useEffect(() => {
    if (step !== "otp" || !challenge) return;
    const attemptKey = challenge.verificationId;
    const tryInstantContinue = () => {
      if (autoVerifyHandledRef.current === attemptKey) return;
      if (mobileVerifyInFlightRef.current) return;
      if (phoneOtpRef.current.verificationId !== challenge.verificationId) return;
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
    const storedDeadline = mobileResendAvailableAt ?? challenge.resendAvailableAt ?? null;
    const resendDecision = presentedPhoneResend({
      resendAvailableAt: storedDeadline,
      now: Date.now(),
    });
    if (!resendDecision.invoke || !resendDecision.forceResend) {
      if (storedDeadline == null) {
        const deadline = sharedPhoneResendDeadline(null, Date.now());
        setMobileResendAvailableAt(deadline);
        applyFlowError(new AppError("otp_send_failed", copy.resendWait), "phone_otp");
      }
      return;
    }
    let generation = phoneOtpRef.current.generation;
    let sendPhone = challenge.phoneE164;
    let sendStarted = false;
    setResending(true);
    try {
      const sent = await submitPhoneResend({
        ops: phoneOpsRef.current,
        invoke: true,
        forceResend: true,
        send: async () => {
          const provenance = resolveResendPhoneSendTarget({
            activeChallengePhoneE164: challenge.phoneE164,
            statePhoneE164: phoneE164,
          });
          assertPhoneSendProvenance(provenance);
          sendPhone = provenance.firebaseSendPhoneE164;
          const started = beginPhoneOtpSend(phoneOtpRef.current);
          if (!started) {
            throw new AppError("otp_send_failed", copy.resendWait);
          }
          phoneOtpRef.current = started;
          generation = started.generation;
          sendStarted = true;
          autoVerifyHandledRef.current = null;
          setPhoneE164(sendPhone);
          return startOtp(sendPhone, { forceResend: true });
        },
      });
      if (sent.ignored) return;
      if (sent.unknown || !sent.sent || !sent.value) {
        if (sent.unknown) retireDispatchedNativeSend();
        if (sendStarted) {
          const failed = failPhoneOtpSend(phoneOtpRef.current, generation);
          if (failed) phoneOtpRef.current = failed;
        }
        applyFlowError(
          new AppError("otp_send_failed", copy.resultUnknown, undefined, { phoneAuthSettlement: "unknown" }),
          "phone_otp"
        );
        return;
      }
      const next = sent.value;
      if (!isCurrentPhoneChallenge(phoneOtpRef.current, generation)) return;
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
      const completed = completePhoneOtpSend(
        phoneOtpRef.current,
        generation,
        next.verificationId
      );
      if (completed) phoneOtpRef.current = completed;
      clearFlowError();
      setPhoneOtpRestored(false);
      const expiresAt =
        typeof next.expiresAt === "number" && Number.isFinite(next.expiresAt) ? next.expiresAt : null;
      const deadline = sharedPhoneResendDeadline(next.resendAvailableAt ?? null, Date.now());
      setChallenge({
        ...next,
        devCodeHint: null,
        resendAvailableAt: deadline,
        expiresAt: expiresAt ?? undefined,
      });
      setDevHint(null);
      setMobileOtpDigits("");
      setOtpFormEpoch((n) => n + 1);
      setMobileExpiresAt(expiresAt);
      setMobileResendAvailableAt(deadline);
      setMobileLockUntil(null);
      const stillResend = () => isCurrentPhoneChallenge(phoneOtpRef.current, generation);
      void saveAuthWrapperChallenge(
        {
          phoneE164: next.phoneE164,
          verificationId: next.verificationId,
          devCodeHint: null,
        },
        stillResend
      );
      if (expiresAt != null) {
        void import("@/services/auth/mobileOtpSecureDigits").then(({ saveMobileOtpDigitSnapshot }) =>
          saveMobileOtpDigitSnapshot(
            {
              phoneE164: next.phoneE164,
              verificationId: next.verificationId,
              digits: "",
              expiresAt,
              resendAvailableAt: deadline,
            },
            stillResend
          )
        );
      }
    } catch (e) {
      const failed = failPhoneOtpSend(phoneOtpRef.current, generation);
      if (failed) phoneOtpRef.current = failed;
      if (!isCurrentPhoneChallenge(phoneOtpRef.current, generation)) return;
      if (e instanceof AppError && e.details?.resendAvailableAt != null) {
        setMobileResendAvailableAt(Number(e.details.resendAvailableAt));
        clearFlowError();
        return;
      }
      applyFlowError(e, "phone_otp");
    } finally {
      if (phoneOtpRef.current.generation === generation) {
        setResending(false);
      }
    }
  };

  const handleEmailContinue = async () => {
    const trimmed = emailDraft.trim().toLowerCase();
    if (!user) return;
    if (emailSendInFlightRef.current) return;

    const action = resolveVerifiedEmailContinueAction({
      draftEmail: trimmed,
      verifiedEmail: user.normalizedEmail ?? user.businessEmail ?? "",
      emailAuthoritativelyVerified: hasAuthoritativeVerifiedEmail(user),
    });
    if (action === "invalid") return;
    if (action === "proceed_without_otp") {
      goToBusinessIdentity({ userInitiated: true });
      return;
    }
    if (!canUseOrdinaryEmailBinding(user)) {
      setEmailHint(VERIFIED_EMAIL_CHANGE_SUPPORT_MESSAGE);
      return;
    }

    // In-flight guard before any navigation/state so rapid taps cannot issue two challenges.
    emailSendInFlightRef.current = true;
    clearFlowError();
    setEmailHint(null);

    // Navigate-first: dismiss keyboard, show OTP screen, send in background.
    Keyboard.dismiss();
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
            presentEmailOtpSendError(e)
          );
          if (failed) setEmailSendMachine(failed);
        } else if (completed) {
          setEmailSendMachine(completed);
        }
        clearFlowError();
        return;
      }
      if (e instanceof AppError && e.code === "email_already_linked") {
        const failed = failEmailOtpSend(started, generation, presentEmailOtpSendError(e));
        if (failed) setEmailSendMachine(failed);
        applyFlowError(e, "email_otp");
        return;
      }
      if (e instanceof AppError && e.code === "email_pending_deletion") {
        const failed = failEmailOtpSend(started, generation, presentEmailOtpSendError(e));
        if (failed) setEmailSendMachine(failed);
        applyFlowError(e, "email_otp");
        return;
      }
      const sendFailure = presentEmailOtpSendError(e);
      const failed = failEmailOtpSend(started, generation, sendFailure);
      if (failed) setEmailSendMachine(failed);
      if (e instanceof AppError) {
        applyFlowError(e, "email_otp");
      } else {
        applyFlowError(
          new AppError("otp_send_failed", sendFailure, undefined, { authPhase: "send" }),
          "email_otp"
        );
      }
    } finally {
      emailSendInFlightRef.current = false;
    }
  };

  const handleEmailRetrySend = async () => {
    if (!user) return;
    if (!canUseOrdinaryEmailBinding(user)) {
      setEmailHint(VERIFIED_EMAIL_CHANGE_SUPPORT_MESSAGE);
      return;
    }
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
        presentEmailOtpSendError(e)
      );
      if (failed) setEmailSendMachine(failed);
      applyFlowError(e, "email_otp");
    } finally {
      emailSendInFlightRef.current = false;
    }
  };

  const handleEmailResend = async () => {
    if (!user || !emailVerificationId || emailResendInFlightRef.current) return;
    if (!canUseOrdinaryEmailBinding(user)) {
      setEmailHint(VERIFIED_EMAIL_CHANGE_SUPPORT_MESSAGE);
      return;
    }
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
      applyFlowError(e, "email_otp");
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
        goToBusinessIdentity({ userInitiated: true });
        setEmailCode("");
        setEmailVerificationId(null);
        setEmailSendMachine(createEmailOtpSendMachine());
      });
    } catch (e) {
      abortVerificationProcess();
      applyFlowError(e, "email_otp");
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

  const resetToPhone = () => {
    const oldChallenge = challenge
      ? { phoneE164: challenge.phoneE164, verificationId: challenge.verificationId }
      : null;
    const leavingOperationId = phoneOpsRef.current.view().operationId;
    retireDispatchedNativeSend();
    retireDispatchedNativeConfirm();
    // The JavaScript lock stays while the same Activity can still finish
    // verifyPhoneNumber. It is cleared only when that Activity is gone.
    recoverUnsettledNativeSend();
    recoverUnsettledNativeConfirm();
    beginSessionCommit();
    phoneOpsRef.current.retire();
    abortVerificationProcess();
    setLoading(false);
    mobileVerifyInFlightRef.current = false;
    setResending(false);
    phoneOtpRef.current = retirePhoneChallenge(phoneOtpRef.current);
    const resetGeneration = phoneOtpRef.current.generation;
    const isResetCurrent = () => phoneOtpRef.current.generation === resetGeneration;
    autoVerifyHandledRef.current = null;
    setPhoneOtpRestored(false);
    setStep("phone");
    setChallenge(null);
    clearFlowError();
    if (status !== "signed_in") {
      setPhoneE164(null);
    } else if (user?.phoneE164) {
      setPhoneE164(user.phoneE164);
      setPhoneDraft({
        countryCode: DEFAULT_AUTH_V2_COUNTRY_CODE,
        localNumber: localDigitsFromE164(user.phoneE164),
      });
      reviewingRef.current = true;
      markReviewingWizardStep("mobileEntry", user?.uid ?? null, {
        phoneE164: user.phoneE164,
      });
    }
    void escapePhoneChallenge({
      ops: phoneOpsRef.current,
      operationId: leavingOperationId,
      boundMs: PHONE_CLEANUP_BOUND_MS,
      clear: async () => {
        if (!oldChallenge) return;
        try {
          const { localMockCancelMobileOtp } = await import("@/services/auth/localMockMobileOtp");
          if (isResetCurrent()) localMockCancelMobileOtp(oldChallenge.phoneE164);
        } catch {
          // Cancel is best-effort and must not hold the phone screen.
        }
        const { clearMobileOtpDigitSnapshot } = await import("@/services/auth/mobileOtpSecureDigits");
        await clearMobileOtpDigitSnapshot(oldChallenge, isResetCurrent);
        await clearAuthWrapperChallenge(oldChallenge, isResetCurrent);
      },
    });
  };

  // Chip means THIS challenge (or completed registration identity) was proven —
  // not merely that some AuthProvider session exists.
  const emailVerifiedChip = hasAuthoritativeVerifiedEmail(user);
  const mobileVerifiedCheckpoint = isAuthoritativeMobileVerified({
    phoneChallengeProven,
    signedIn: status === "signed_in",
    profilePhoneE164: user?.phoneE164 ?? phoneE164,
  });
  const emailBackPolicy = resolveEmailAuthBackPolicy({
    mobileAuthoritativelyVerified: mobileVerifiedCheckpoint,
    reviewingFromProfile:
      reviewingRef.current && (paramFrom === "profile" || paramIntent === "review"),
  });
  const phoneScreenError = errorVisibleOnSurface(errorSurface, "phone") ? error : null;
  const phoneOtpScreenError = errorVisibleOnSurface(errorSurface, "phone_otp") ? error : null;
  const emailScreenError = errorVisibleOnSurface(errorSurface, "email") ? error : null;
  const emailOtpScreenError = errorVisibleOnSurface(errorSurface, "email_otp") ? error : null;
  const visibleDiagnostic = shouldShowAuthDiagnosticsInUi() ? errorDiagnostic : null;

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
        error={phoneScreenError}
        errorTitle={phoneScreenError ? errorTitle : null}
        errorDiagnostic={phoneScreenError ? visibleDiagnostic : null}
        onCopyErrorDiagnostics={() => void copyPhoneAuthDiagnostics()}
      />
    );
  }

  if (renderBranch === "otp" && challenge && phoneE164) {
    return wrapWithAck(
      <OtpVerificationScreen
        key={`${challenge.verificationId}:${otpFormEpoch}`}
        phoneE164={challenge.phoneE164}
        devCodeHint={null}
        resendAvailableAt={mobileResendAvailableAt ?? challenge.resendAvailableAt ?? null}
        lockUntil={mobileLockUntil}
        initialDigits={mobileOtpDigits}
        subtitle={
          phoneOtpRestored
            ? copy.restoredCode(formatDisplayPhone(challenge.phoneE164))
            : undefined
        }
        onDigitsChange={(digits) => {
          const digitGeneration = phoneOtpRef.current.generation;
          setMobileOtpDigits(digits);
          if (typeof mobileExpiresAt !== "number") return;
          const expiresAt = mobileExpiresAt;
          void (async () => {
            const { saveMobileOtpDigitSnapshot } = await import(
              "@/services/auth/mobileOtpSecureDigits"
            );
            await saveMobileOtpDigitSnapshot(
              {
                phoneE164,
                verificationId: challenge.verificationId,
                digits,
                expiresAt,
                resendAvailableAt: mobileResendAvailableAt ?? expiresAt,
              },
              () => isCurrentPhoneChallenge(phoneOtpRef.current, digitGeneration)
            );
          })();
        }}
        onVerify={(code) => void handleVerifyOtp(code)}
        onResend={() => void handleResend()}
        onChangeNumber={() => {
          resetToPhone();
        }}
        loading={loading}
        resending={resending}
        error={phoneOtpScreenError}
        errorTitle={phoneOtpScreenError ? errorTitle : null}
        errorDiagnostic={phoneOtpScreenError ? visibleDiagnostic : null}
        errorCode={phoneOtpScreenError ? phoneAuthError?.code ?? null : null}
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
        error={sendFailed ? emailSendMachine.errorMessage ?? emailOtpScreenError : emailOtpScreenError}
      />
    );
  }

  if (step === "email") {
    return wrapWithAck(
      <EmailEntryScreen
        value={emailDraft}
        onChange={setEmailDraft}
        onContinue={() => void handleEmailContinue()}
        onBack={
          emailBackPolicy === "profile_review"
            ? () => goToBusinessIdentity({ userInitiated: true })
            : undefined
        }
        loading={loading || emailSendMachine.state === "sending"}
        error={emailScreenError}
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
      error={claimExpired ? t("errors.sessionExpired") : phoneScreenError}
      errorTitle={phoneScreenError || claimExpired ? errorTitle : null}
      errorDiagnostic={phoneScreenError || claimExpired ? visibleDiagnostic : null}
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
