import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

import { logStage2ActionSystemProvenance } from "@/actionSystem/stage2RuntimeProvenance";
import { AuthCardActionAffordance } from "@/auth-v2/components/AuthCardActionAffordance";
import { AuthShell } from "@/auth-v2/components/AuthShell";
import { AuthTertiaryTextAction } from "@/auth-v2/components/AuthTertiaryTextAction";
import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { AuthV2SecondaryButton } from "@/auth-v2/components/AuthV2SecondaryButton";
import {
  ReviewInfoCard,
  ReviewStatusBadge,
} from "@/auth-v2/components/ReviewEditShell";
import { OnboardingInlineMessage } from "@/auth-v2/components/OnboardingInlineMessage";
import { OnboardingV2TextField } from "@/auth-v2/components/OnboardingV2TextField";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import {
  CONTACT_CHANGE_MIN_VERIFYING_VISIBLE_MS,
  CONTACT_CHANGE_PURPOSE,
  type ContactChangeChannel,
  type ContactChangePhase,
  validateReplacementEmail,
  validateReplacementMobile,
} from "@/auth-v2/contactChange/contactChangeModel";
import {
  assertReviewContactEditAllowed,
  reviewContactEditLimitMessage,
} from "@/auth-v2/reviewContactEditPolicy";
import { REVIEW_CONTACTS_SECURITY_NOTE } from "@/auth-v2/reviewEditCopy";
import { OtpVerificationScreen } from "@/auth-v2/screens/OtpVerificationScreen";
import { EmailOtpScreen } from "@/auth-v2/screens/EmailOtpScreen";
import { VerificationSuccessAck } from "@/auth-v2/components/VerificationSuccessAck";
import { userFacingMessage, AppError } from "@/domain/errors";
import type { OtpChallenge } from "@/services/auth/types";
import type { UserProfile } from "@/domain/types";
import { EMAIL_OTP_LENGTH } from "@/services/auth/emailOtpConstants";
import { spacing, typography } from "@/theme";
import { formatDisplayPhone, maskMobile } from "@/utils/phone";
import { useAuthoritativeResendCountdown } from "@/hooks/useAuthoritativeResendCountdown";

void CONTACT_CHANGE_PURPOSE;

export type ContactChangeAdapters = {
  startPhone: (phoneE164: string) => Promise<OtpChallenge>;
  confirmPhone: (challenge: OtpChallenge, code: string) => Promise<UserProfile>;
  /** After Auth updated but server bind failed — complete bind without new OTP. */
  retryPhoneServerBind?: () => Promise<UserProfile>;
  startEmail: (email: string) => Promise<{
    verificationId: string;
    resendAvailableAt?: number;
    expiresAt?: number;
  }>;
  resendEmail: (
    verificationId: string,
    email: string
  ) => Promise<{
    verificationId: string;
    resendAvailableAt?: number;
    expiresAt?: number;
  }>;
  confirmEmail: (verificationId: string, code: string, email: string) => Promise<UserProfile>;
  /**
   * After authoritative bind — reconcile central session/profile BEFORE success UI.
   * May be async; panel awaits before showing verified success.
   */
  onAuthoritativePhone: (profile: UserProfile) => void | Promise<void>;
  onAuthoritativeEmail: (profile: UserProfile) => void | Promise<void>;
};

interface VerifiedContactChangePanelProps {
  phoneE164: string;
  email: string;
  emailVerified: boolean;
  phoneChangeAvailable: boolean;
  emailChangeAvailable: boolean;
  mobileReviewChangeCount?: number;
  emailReviewChangeCount?: number;
  profileCompletedAt?: number | null;
  adapters: ContactChangeAdapters;
  /** When true, hide shell Done (parent should hide primary while nested). */
  onPhaseChange?: (phase: ContactChangePhase) => void;
}

/**
 * Verified contacts overview + nested phone/email change.
 * Cancel / failure always leaves the previous verified contact authoritative.
 */
export function VerifiedContactChangePanel({
  phoneE164,
  email,
  emailVerified,
  phoneChangeAvailable,
  emailChangeAvailable,
  mobileReviewChangeCount = 0,
  emailReviewChangeCount = 0,
  profileCompletedAt = null,
  adapters,
  onPhaseChange,
}: VerifiedContactChangePanelProps) {
  const { tokens } = useAuthV2Theme();
  const [phase, setPhase] = useState<ContactChangePhase>("overview");
  const [activeChannel, setActiveChannel] = useState<ContactChangeChannel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localMobile, setLocalMobile] = useState("");
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [phoneChallenge, setPhoneChallenge] = useState<OtpChallenge | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneResending, setPhoneResending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [emailChallengeId, setEmailChallengeId] = useState<string | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailResending, setEmailResending] = useState(false);
  const [emailResendAt, setEmailResendAt] = useState<number | null>(null);
  const [displayPhone, setDisplayPhone] = useState(phoneE164);
  const [displayEmail, setDisplayEmail] = useState(email);
  const [displayEmailVerified, setDisplayEmailVerified] = useState(emailVerified);
  const inFlightRef = useRef(false);

  const emailResend = useAuthoritativeResendCountdown(emailResendAt);

  useEffect(() => {
    logStage2ActionSystemProvenance("VerifiedContactChangePanel");
  }, []);

  // Keep overview in sync when parent reconciles authoritative contacts (no frozen mount snapshot).
  useEffect(() => {
    setDisplayPhone(phoneE164);
  }, [phoneE164]);
  useEffect(() => {
    setDisplayEmail(email);
    setDisplayEmailVerified(emailVerified);
  }, [email, emailVerified]);

  const goPhase = useCallback(
    (next: ContactChangePhase) => {
      setPhase(next);
      onPhaseChange?.(next);
    },
    [onPhaseChange]
  );

  const resetToOverview = useCallback(() => {
    inFlightRef.current = false;
    setActiveChannel(null);
    setError(null);
    setLocalMobile("");
    setPendingPhone(null);
    setPhoneChallenge(null);
    setPhoneBusy(false);
    setPendingEmail(null);
    setEmailInput("");
    setEmailChallengeId(null);
    setEmailCode("");
    setEmailBusy(false);
    setEmailResendAt(null);
    goPhase("overview");
  }, [goPhase]);

  const phoneEditGate = assertReviewContactEditAllowed({
    channel: "mobile",
    count: mobileReviewChangeCount,
    profileCompletedAt,
  });
  const emailEditGate = assertReviewContactEditAllowed({
    channel: "email",
    count: emailReviewChangeCount,
    profileCompletedAt,
  });
  const phoneEditable = phoneChangeAvailable && phoneEditGate.ok;
  const emailEditable = emailChangeAvailable && emailEditGate.ok;

  const beginPhone = () => {
    if (!phoneEditable || activeChannel === "email") return;
    setError(null);
    setActiveChannel("phone");
    setLocalMobile("");
    goPhase("phone_entry");
  };

  const beginEmail = () => {
    if (!emailEditable || activeChannel === "phone") return;
    setError(null);
    setActiveChannel("email");
    setEmailInput("");
    goPhase("email_entry");
  };

  const sendPhoneOtp = async () => {
    if (inFlightRef.current) return;
    const validated = validateReplacementMobile({
      localNumber: localMobile,
      currentPhoneE164: displayPhone,
    });
    if (!validated.ok) {
      setError(validated.message);
      return;
    }
    inFlightRef.current = true;
    setPhoneBusy(true);
    setError(null);
    try {
      const challenge = await adapters.startPhone(validated.phoneE164);
      setPendingPhone(validated.phoneE164);
      setPhoneChallenge(challenge);
      goPhase("phone_otp");
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      inFlightRef.current = false;
      setPhoneBusy(false);
    }
  };

  const verifyPhoneOtp = async (code: string) => {
    if (!phoneChallenge || !pendingPhone || inFlightRef.current) return;
    inFlightRef.current = true;
    setPhoneBusy(true);
    setError(null);
    goPhase("phone_verifying");
    const started = Date.now();
    try {
      const profile = await adapters.confirmPhone(phoneChallenge, code);
      const remain = Math.max(
        0,
        CONTACT_CHANGE_MIN_VERIFYING_VISIBLE_MS - (Date.now() - started)
      );
      if (remain > 0) await new Promise((r) => setTimeout(r, remain));
      await adapters.onAuthoritativePhone(profile);
      setDisplayPhone(profile.phoneE164);
      if (__DEV__) {
        console.log("[review-state] profile reconciled channel=mobile");
      }
      goPhase("phone_verified");
    } catch (e) {
      const recovery =
        e instanceof AppError && Boolean(e.details?.mobileChangeRecoveryRequired);
      setError(userFacingMessage(e));
      if (recovery) {
        goPhase("phone_recovering");
      } else {
        goPhase("phone_otp");
      }
    } finally {
      inFlightRef.current = false;
      setPhoneBusy(false);
    }
  };

  const retryPhoneBind = async () => {
    if (!adapters.retryPhoneServerBind || inFlightRef.current) return;
    inFlightRef.current = true;
    setPhoneBusy(true);
    setError(null);
    goPhase("phone_verifying");
    try {
      const profile = await adapters.retryPhoneServerBind();
      await adapters.onAuthoritativePhone(profile);
      setDisplayPhone(profile.phoneE164);
      goPhase("phone_verified");
    } catch (e) {
      setError(userFacingMessage(e));
      goPhase("phone_recovering");
    } finally {
      inFlightRef.current = false;
      setPhoneBusy(false);
    }
  };

  const resendPhoneOtp = async () => {
    if (!pendingPhone || phoneResending) return;
    setPhoneResending(true);
    setError(null);
    try {
      const challenge = await adapters.startPhone(pendingPhone);
      setPhoneChallenge(challenge);
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      setPhoneResending(false);
    }
  };

  const sendEmailOtp = async () => {
    if (inFlightRef.current) return;
    const validated = validateReplacementEmail({
      email: emailInput,
      currentEmail: displayEmail,
    });
    if (!validated.ok) {
      setError(validated.message);
      return;
    }
    inFlightRef.current = true;
    setEmailBusy(true);
    setError(null);
    try {
      const started = await adapters.startEmail(validated.email);
      setPendingEmail(validated.email);
      setEmailChallengeId(started.verificationId);
      setEmailResendAt(started.resendAvailableAt ?? Date.now() + 30_000);
      setEmailCode("");
      goPhase("email_otp");
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      inFlightRef.current = false;
      setEmailBusy(false);
    }
  };

  const verifyEmailOtp = async () => {
    if (!emailChallengeId || !pendingEmail || emailCode.length !== EMAIL_OTP_LENGTH) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setEmailBusy(true);
    setError(null);
    goPhase("email_verifying");
    const started = Date.now();
    try {
      const profile = await adapters.confirmEmail(emailChallengeId, emailCode, pendingEmail);
      const remain = Math.max(
        0,
        CONTACT_CHANGE_MIN_VERIFYING_VISIBLE_MS - (Date.now() - started)
      );
      if (remain > 0) await new Promise((r) => setTimeout(r, remain));
      await adapters.onAuthoritativeEmail(profile);
      setDisplayEmail(profile.normalizedEmail ?? profile.businessEmail ?? pendingEmail);
      setDisplayEmailVerified(true);
      if (__DEV__) {
        console.log("[review-state] profile reconciled channel=email");
      }
      goPhase("email_verified");
    } catch (e) {
      setError(userFacingMessage(e));
      goPhase("email_otp");
    } finally {
      inFlightRef.current = false;
      setEmailBusy(false);
    }
  };

  const resendEmailOtp = async () => {
    if (!emailChallengeId || !pendingEmail || emailResending) return;
    setEmailResending(true);
    setError(null);
    try {
      const next = await adapters.resendEmail(emailChallengeId, pendingEmail);
      setEmailChallengeId(next.verificationId);
      setEmailResendAt(next.resendAvailableAt ?? Date.now() + 30_000);
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      setEmailResending(false);
    }
  };

  const otpModalVisible =
    phase === "phone_otp" ||
    phase === "phone_verifying" ||
    phase === "phone_recovering" ||
    phase === "phone_verified" ||
    phase === "email_otp" ||
    phase === "email_verifying" ||
    phase === "email_verified";

  return (
    <View style={styles.stack}>
      <AuthCardActionAffordance
        actionLabel="Change"
        accessibilityLabel="Change mobile number"
        onAction={beginPhone}
        editable={phoneEditable}
        purpose="security"
        chipTestID="contact-change-phone"
        testID="contact-change-phone-card"
        leading={
          <View style={styles.cardHeadText}>
            <Text style={[styles.fieldLabel, { color: tokens.muted }]}>Mobile number</Text>
            <Text style={[styles.fieldValue, { color: tokens.heading }]} selectable>
              {maskMobile(displayPhone)}
            </Text>
            <ReviewStatusBadge kind="verified" />
          </View>
        }
        cardStyle={[
          styles.infoCard,
          { backgroundColor: tokens.cardBg, borderColor: tokens.cardBorder },
        ]}
      />

      <AuthCardActionAffordance
        actionLabel="Change"
        accessibilityLabel="Change email"
        onAction={beginEmail}
        editable={emailEditable}
        purpose="security"
        chipTestID="contact-change-email"
        testID="contact-change-email-card"
        leading={
          <View style={styles.cardHeadText}>
            <Text style={[styles.fieldLabel, { color: tokens.muted }]}>Email</Text>
            <Text style={[styles.fieldValue, { color: tokens.heading }]} selectable>
              {displayEmail.trim() ? displayEmail.trim() : "Not added"}
            </Text>
            <ReviewStatusBadge
              kind={displayEmailVerified && displayEmail.trim() ? "verified" : "not_added"}
            />
          </View>
        }
        cardStyle={[
          styles.infoCard,
          { backgroundColor: tokens.cardBg, borderColor: tokens.cardBorder },
        ]}
      />

      {!phoneEditGate.ok ? (
        <Text style={[styles.helper, { color: tokens.muted }]}>
          {reviewContactEditLimitMessage("mobile")}
        </Text>
      ) : null}
      {!emailEditGate.ok ? (
        <Text style={[styles.helper, { color: tokens.muted }]}>
          {reviewContactEditLimitMessage("email")}
        </Text>
      ) : null}

      <ReviewInfoCard>
        <Text style={[styles.infoTitle, { color: tokens.heading }]}>Identity protection</Text>
        <Text style={[styles.infoLine, { color: tokens.body }]}>{REVIEW_CONTACTS_SECURITY_NOTE}</Text>
      </ReviewInfoCard>

      <Modal
        visible={phase === "phone_entry"}
        animationType="slide"
        onRequestClose={resetToOverview}
      >
        <View style={styles.fullscreen}>
          <AuthShell
            title="Change mobile number"
            subtitle="Enter the new mobile number you want to link to your Vyaamikk identity. We’ll verify it before making any change."
            onBack={resetToOverview}
            headerTop={
              <Text style={[styles.eyebrow, { color: tokens.secondaryActiveFg }]}>SECURITY</Text>
            }
            footerPlacement="actionZone"
            footer={
              <>
                {error ? <OnboardingInlineMessage tone="danger" message={error} /> : null}
                <AuthV2PrimaryButton
                  label="Continue"
                  onPress={() => void sendPhoneOtp()}
                  disabled={phoneBusy || localMobile.replace(/\D/g, "").length !== 10}
                  loading={phoneBusy}
                  loadingLabel="Sending OTP…"
                  purpose="advance"
                  testID="contact-change-phone-continue"
                  activeBg={tokens.ctaActiveBg}
                  activeText={tokens.ctaActiveText}
                  mutedBg={tokens.ctaMutedBg}
                  mutedText={tokens.ctaMutedText}
                  mutedBorder={tokens.ctaMutedBorder}
                />
                <AuthTertiaryTextAction
                  label="Cancel"
                  onPress={resetToOverview}
                  purpose="navigate"
                  accessibilityLabel="Cancel mobile change"
                  testID="contact-change-phone-cancel"
                />
              </>
            }
          >
            <View
              style={[
                styles.currentCard,
                { backgroundColor: tokens.cardBg, borderColor: tokens.cardBorder },
              ]}
            >
              <Text style={[styles.fieldLabel, { color: tokens.muted }]}>Currently verified</Text>
              <Text style={[styles.fieldValue, { color: tokens.heading }]}>
                {formatDisplayPhone(displayPhone)}
              </Text>
            </View>
            <OnboardingV2TextField
              navFieldKey="contactChangeMobile"
              label="New mobile number"
              value={localMobile}
              onChangeText={(v) => {
                setLocalMobile(v.replace(/\D/g, "").slice(0, 10));
                if (error) setError(null);
              }}
              placeholder="10-digit mobile"
              keyboardType="phone-pad"
              maxLength={10}
            />
            <Text style={[styles.helper, { color: tokens.muted }]}>
              Your current verified mobile stays active until this number is verified and securely
              linked.
            </Text>
          </AuthShell>
        </View>
      </Modal>

      <Modal visible={phase === "email_entry"} animationType="slide" onRequestClose={resetToOverview}>
        <View style={[styles.modalBody, { backgroundColor: "#12152E" }]}>
          <Text style={[styles.entryTitle, { color: tokens.heading }]}>Change email</Text>
          <Text style={[styles.helper, { color: tokens.muted }]}>
            Enter the replacement email. Your current verified email stays linked until verification
            succeeds.
          </Text>
          <OnboardingV2TextField
            navFieldKey="contactChangeEmail"
            label="New email"
            value={emailInput}
            onChangeText={setEmailInput}
            placeholder="name@business.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />
          {error ? <Text style={[styles.err, { color: tokens.danger }]}>{error}</Text> : null}
          <AuthV2SecondaryButton
            label="Send verification code"
            onPress={() => void sendEmailOtp()}
            disabled={emailBusy}
            loading={emailBusy}
            loadingLabel="Sending…"
            purpose="advance"
            testID="contact-change-email-send"
          />
          <AuthTertiaryTextAction
            label="Cancel"
            onPress={resetToOverview}
            purpose="navigate"
            accessibilityLabel="Cancel email change"
            testID="contact-change-email-cancel"
          />
        </View>
      </Modal>

      <Modal
        visible={otpModalVisible}
        animationType="slide"
        onRequestClose={() => {
          // After Auth may have moved to B, do not casually abandon reconciliation.
          if (phase === "phone_verifying" || phase === "phone_recovering") return;
          if (phase === "email_verifying") return;
          if (phase === "phone_otp") {
            setPhoneChallenge(null);
            setPendingPhone(null);
            goPhase("phone_entry");
            return;
          }
          resetToOverview();
        }}
      >
        <View style={styles.fullscreen}>
          {phase === "phone_otp" ? (
            <OtpVerificationScreen
              phoneE164={pendingPhone ?? displayPhone}
              onVerify={(code) => void verifyPhoneOtp(code)}
              onResend={() => void resendPhoneOtp()}
              onChangeNumber={() => {
                setPhoneChallenge(null);
                setPendingPhone(null);
                goPhase("phone_entry");
              }}
              loading={phoneBusy}
              resending={phoneResending}
              error={error}
              resendAvailableAt={phoneChallenge?.resendAvailableAt ?? null}
              title="Verify your new mobile number"
              subtitle={`Enter the 6-digit code sent to ${formatDisplayPhone(pendingPhone ?? displayPhone)}`}
              changeNumberLabel="Change number"
            />
          ) : null}
          {phase === "phone_verifying" ? (
            <VerificationSuccessAck
              kind="mobile"
              phase="verifying"
              verifyingLabel="Vyaamikk is verifying…"
              verifyingDetail="Securing your new mobile number…"
              onDone={() => undefined}
            />
          ) : null}
          {phase === "phone_recovering" ? (
            <View style={styles.modalBody}>
              <Text style={[styles.entryTitle, { color: "#EEF0FF" }]}>
                We’re completing the security update
              </Text>
              <Text style={[styles.helper, { color: "#C7CBE8" }]}>
                Your number was verified. Keep this screen open while we finish updating your
                account.
              </Text>
              {error ? <Text style={[styles.err, { color: "#FCA5A5" }]}>{error}</Text> : null}
              <AuthV2SecondaryButton
                label="Try again"
                onPress={() => void retryPhoneBind()}
                disabled={phoneBusy}
                loading={phoneBusy}
                loadingLabel="Finishing…"
                purpose="retry"
                testID="contact-change-phone-recover-retry"
              />
            </View>
          ) : null}
          {phase === "phone_verified" ? (
            <VerificationSuccessAck
              kind="mobile"
              phase="success"
              successLabel="Mobile number verified"
              onDone={resetToOverview}
            />
          ) : null}
          {phase === "email_otp" ? (
            <EmailOtpScreen
              email={pendingEmail ?? displayEmail}
              code={emailCode}
              onCodeChange={setEmailCode}
              onVerify={() => void verifyEmailOtp()}
              onResend={() => void resendEmailOtp()}
              onBack={resetToOverview}
              loading={emailBusy}
              resending={emailResending}
              canVerify={emailCode.length === EMAIL_OTP_LENGTH}
              resendRemaining={emailResend.remainingSeconds}
              canResend={emailResend.canResend}
              error={error}
            />
          ) : null}
          {phase === "email_verifying" ? (
            <VerificationSuccessAck
              kind="email"
              phase="verifying"
              verifyingLabel="Vyaamikk is verifying…"
              verifyingDetail="Securing your email…"
              onDone={() => undefined}
            />
          ) : null}
          {phase === "email_verified" ? (
            <VerificationSuccessAck
              kind="email"
              phase="success"
              successLabel="Email verified"
              onDone={resetToOverview}
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  fullscreen: { flex: 1, backgroundColor: "#12152E" },
  modalBody: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl * 2,
    gap: spacing.md,
  },
  entryTitle: { ...typography.titleMd, fontSize: 20 },
  helper: { ...typography.caption, lineHeight: 18 },
  err: { ...typography.caption },
  fieldLabel: {
    ...typography.micro,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  fieldValue: { ...typography.body, fontSize: 18, fontWeight: "600" },
  infoTitle: { ...typography.bodyStrong },
  infoLine: { ...typography.caption, lineHeight: 18 },
  cardHeadText: { flex: 1, gap: spacing.xs },
  infoCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
  },
  currentCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  eyebrow: {
    ...typography.micro,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
});
