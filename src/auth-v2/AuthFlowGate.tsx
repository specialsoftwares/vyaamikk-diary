import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  clearAuthWrapperChallenge,
  clearAuthWrapperProgress,
  loadAuthWrapperChallenge,
  markAuthWrapperEmailComplete,
  markAuthWrapperEmailPending,
  saveAuthWrapperChallenge,
} from "@/auth-v2/authWrapperProgress";
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
  startBusinessEmailVerification,
} from "@/services/auth/bindBusinessEmail";
import { hasAuthoritativeVerifiedEmail } from "@/auth/identityRouteState";
import { Banner, Button, LocaleUiText } from "@/components/ui";
import { spacing, typography } from "@/theme";
import type { OtpChallenge } from "@/services/auth/types";

const EMAIL_CODE_LENGTH = 6;

/**
 * Premium Indigo auth wrapper — sole sign-in entry for the app.
 */
export function AuthFlowGate() {
  const t = useT();
  const router = useRouter();
  const { step: paramStep, from: paramFrom } = useLocalSearchParams<{
    step?: string;
    from?: string;
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
  const emailCodeInputRef = useRef<TextInput>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const handoffToApp = useCallback(() => {
    router.replace("/");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (status === "loading") return;

      if (status === "signed_in" && user) {
        if (hasAuthoritativeVerifiedEmail(user) && user.profileCompletedAt) {
          handoffToApp();
          return;
        }
        if (hasAuthoritativeVerifiedEmail(user)) {
          await markAuthWrapperEmailComplete(user.uid);
          handoffToApp();
          return;
        }
        setEmailDraft(user.businessEmail ?? "");
        setStep("email");
        if (!cancelled) setHydrated(true);
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
      }
      if (!cancelled) setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [status, user, router, handoffToApp, paramStep]);

  useEffect(() => {
    if (status === "signed_in" && user && !user.profileCompletedAt && paramStep === "email") {
      setStep("email");
      setEmailDraft(user.businessEmail ?? "");
    }
  }, [paramStep, status, user]);

  const handleContinueToConfirm = () => {
    setError(null);
    try {
      const e164 = toE164FromDraft(phoneDraft.countryCode, phoneDraft.localNumber);
      setPhoneE164(e164);
      setStep("confirm");
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
      setChallenge(next);
      setDevHint(next.devCodeHint);
      await saveAuthWrapperChallenge({
        phoneE164: next.phoneE164,
        verificationId: next.verificationId,
        devCodeHint: next.devCodeHint,
      });
      setStep("otp");
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

      if (hasAuthoritativeVerifiedEmail(profile)) {
        await markAuthWrapperEmailComplete(profile.uid);
        handoffToApp();
        return;
      }

      await markAuthWrapperEmailPending(profile.uid);
      setEmailDraft(profile.businessEmail ?? "");
      setStep("email");
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
      setChallenge(next);
      setDevHint(next.devCodeHint);
      await saveAuthWrapperChallenge({
        phoneE164: next.phoneE164,
        verificationId: next.verificationId,
        devCodeHint: next.devCodeHint,
      });
    } catch (e) {
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
      const { verificationId, devCodeHint } = await startBusinessEmailVerification(
        user.uid,
        trimmed
      );
      setEmailVerificationId(verificationId);
      setEmailCode("");
      if (devCodeHint) setEmailHint(`Development OTP: ${devCodeHint}`);
      setStep("email_verify");
      setTimeout(() => emailCodeInputRef.current?.focus(), 280);
    } catch (e) {
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

  const handleVerifyEmailCode = async () => {
    if (!user || !emailVerificationId || emailCode.length !== EMAIL_CODE_LENGTH) return;
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
      handoffToApp();
    } catch (e) {
      setError(userFacingMessage(e));
      setEmailCode("");
    } finally {
      setLoading(false);
    }
  };

  const resetToPhone = async () => {
    setStep("phone");
    setChallenge(null);
    setPhoneE164(null);
    setError(null);
    await clearAuthWrapperChallenge();
    if (status === "signed_in") {
      await signOut();
    }
  };

  if (!hydrated || status === "loading") {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

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
        loading={loading}
        error={error}
      />
    );
  }

  if (step === "otp" && challenge && phoneE164) {
    return (
      <OtpVerificationScreen
        phoneE164={phoneE164}
        devCodeHint={devHint}
        onVerify={(code) => void handleVerifyOtp(code)}
        onResend={() => void handleResend()}
        onChangeNumber={() => void resetToPhone()}
        loading={loading}
        resending={resending}
        error={error}
      />
    );
  }

  if (step === "email_verify") {
    const emailVerifyComplete = emailCode.length === EMAIL_CODE_LENGTH;
    return (
      <View style={styles.boot}>
        <View style={styles.emailVerifyCard}>
          <LocaleUiText style={styles.emailVerifyTitle}>
            {t("pendingDeletion.reactivateEmailTitle")}
          </LocaleUiText>
          <LocaleUiText style={styles.emailVerifyBody}>
            {t("pendingDeletion.reactivateEmailHint")}
          </LocaleUiText>
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
            disabled={!emailVerifyComplete}
          />
          <Button
            label={t("common.back")}
            variant="ghost"
            onPress={() => {
              setStep("email");
              setEmailVerificationId(null);
              setEmailCode("");
              setError(null);
            }}
            disabled={loading}
          />
        </View>
      </View>
    );
  }

  if (step === "email") {
    const backFromProfile = paramFrom === "profile";
    return (
      <EmailEntryScreen
        value={emailDraft}
        onChange={setEmailDraft}
        onContinue={() => void handleEmailContinue()}
        onBack={
          backFromProfile
            ? () => router.replace("/(auth)/complete-profile")
            : undefined
        }
        loading={loading}
        error={error}
        hint={user?.businessEmail ? t("authV2.email.prefilledHint") : null}
      />
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
});
