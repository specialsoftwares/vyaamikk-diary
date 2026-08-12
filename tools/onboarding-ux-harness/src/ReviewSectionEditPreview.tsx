import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { AuthV2SecondaryButton } from "@/auth-v2/components/AuthV2SecondaryButton";
import { LocationConfirmationCard } from "@/auth-v2/components/LocationConfirmationCard";
import { OnboardingInlineMessage } from "@/auth-v2/components/OnboardingInlineMessage";
import { OnboardingV2TextField } from "@/auth-v2/components/OnboardingV2TextField";
import { ReviewEditShell } from "@/auth-v2/components/ReviewEditShell";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import {
  REVIEW_EMAIL_CHANGE_AVAILABLE,
  REVIEW_PHONE_CHANGE_AVAILABLE,
  reviewEditCopy,
} from "@/auth-v2/reviewEditCopy";
import {
  reviewEditAllowsPinLookup,
  type ReviewEditTarget,
} from "@/auth-v2/reviewEditIntent";
import {
  ReviewConstitutionEditFields,
  ReviewGstinEditFields,
  ReviewIdentityEditFields,
  ReviewLogoEditFields,
} from "@/auth-v2/screens/reviewEdit/ReviewEditSectionViews";
import {
  VerifiedContactChangePanel,
  type ContactChangeAdapters,
} from "@/auth-v2/contactChange/VerifiedContactChangePanel";
import type { UserProfile } from "@/domain/types";
import { LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP } from "@/services/auth/mobileOtpConstants";
import { LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP } from "@/services/auth/emailOtpConstants";
import { AppError } from "@/domain/errors";
import { normalizePhoneE164 } from "@/utils/mobileHash";
import { evaluateGstinInput } from "@/onboarding/gstinVerificationState";
import { isIndividualProfessionalPractice } from "@/onboarding/businessConstitution";
import type { GstinVerificationState } from "@/onboarding/profileIdentityModel";
import { lookupPostalPincodeApi } from "@/services/location/postalPincodeApi";
import { spacing, typography } from "@/theme";
import { normalizeGstin } from "@/utils/gst/gstin";

import type { ConfirmedPinPreview } from "./IdentityLocationPreview";

export interface HarnessReviewEditModel {
  displayName: string;
  businessName: string;
  constitution: string;
  gstin: string;
  gstinState: GstinVerificationState;
  pinCode: string;
  confirmedPin: ConfirmedPinPreview | null;
  phoneE164: string;
  email: string;
  logoUri: string | null;
}

interface ReviewSectionEditPreviewProps {
  target: ReviewEditTarget;
  model: HarnessReviewEditModel;
  /**
   * Commit patch into shared harness session AND return to Review.
   * Used by ordinary editors (identity, logo, PIN, GSTIN, constitution).
   */
  onSave: (next: Partial<HarnessReviewEditModel>) => void;
  /**
   * Reconcile shared harness session WITHOUT navigation.
   * Required for verified contact bind (Mutation Propagation Contract).
   */
  onCommit?: (next: Partial<HarnessReviewEditModel>) => void;
  onBack: () => void;
  /** Optional local logo URI after user taps Choose logo (no production write). */
  onPickLogoLocal?: () => Promise<string | null>;
  pinLookupSpy?: () => void;
}

/**
 * Harness adapter for shared Review Edit presentation.
 * Same visual language as production — no DEV/simulate UI copy.
 */
export function ReviewSectionEditPreview({
  target,
  model,
  onSave,
  onCommit,
  onBack,
  onPickLogoLocal,
  pinLookupSpy,
}: ReviewSectionEditPreviewProps) {
  const { tokens } = useAuthV2Theme();
  const copy = reviewEditCopy(target);
  const [displayName, setDisplayName] = useState(model.displayName);
  const [businessName, setBusinessName] = useState(model.businessName);
  const [constitution, setConstitution] = useState(model.constitution);
  const [gstin, setGstin] = useState(model.gstin);
  const [gstinState, setGstinState] = useState(model.gstinState);
  const [pinCode, setPinCode] = useState(model.pinCode);
  const [confirmedPin, setConfirmedPin] = useState(model.confirmedPin);
  const [logoUri, setLogoUri] = useState(model.logoUri);
  const [choosingLogo, setChoosingLogo] = useState(false);
  const [pinUi, setPinUi] = useState<"idle" | "looking_up" | "confirmed" | "choices" | "not_found">(
    model.confirmedPin ? "confirmed" : "idle"
  );
  const [choices, setChoices] = useState<{
    localities: string[];
    district: string;
    state: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationSnapshot = useRef(model.confirmedPin);
  const [sessionPhone, setSessionPhone] = useState(model.phoneE164);
  const [sessionEmail, setSessionEmail] = useState(model.email);

  const harnessContactAdapters: ContactChangeAdapters = {
    startPhone: async (phoneE164) => {
      await new Promise((r) => setTimeout(r, 450));
      // Purpose: contact_change simulation only — never resolveOrCreateUserByPhone.
      return {
        verificationId: `harness_contact_change_${Date.now()}`,
        phoneE164,
        resendAvailableAt: Date.now() + 30_000,
        expiresAt: Date.now() + 10 * 60_000,
      };
    },
    confirmPhone: async (challenge, code) => {
      // Simulate OTP → native update → server bind latency for verifying overlay.
      await new Promise((r) => setTimeout(r, 1100));
      if (code.trim() !== LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP) {
        throw new AppError("invalid_otp", "Incorrect OTP.");
      }
      const phone = normalizePhoneE164(challenge.phoneE164);
      // Collision simulation: numbers ending in 0000 are "taken"
      if (phone.endsWith("0000")) {
        throw new AppError(
          "permission_denied",
          "This mobile number cannot be used for this account. Please use another number or contact support."
        );
      }
      const profile = {
        uid: "harness-uid",
        ueid: "VD-HARNESS",
        phoneE164: phone,
      } as UserProfile;
      // Authoritative display updates only via onAuthoritativePhone after verifying settles.
      return profile;
    },
    startEmail: async (_email) => {
      await new Promise((r) => setTimeout(r, 400));
      return {
        verificationId: `harness_email_${Date.now()}`,
        resendAvailableAt: Date.now() + 30_000,
        expiresAt: Date.now() + 15 * 60_000,
      };
    },
    resendEmail: async (_verificationId, _email) => {
      await new Promise((r) => setTimeout(r, 300));
      return {
        verificationId: `harness_email_${Date.now()}`,
        resendAvailableAt: Date.now() + 30_000,
        expiresAt: Date.now() + 15 * 60_000,
      };
    },
    confirmEmail: async (_verificationId, code, email) => {
      await new Promise((r) => setTimeout(r, 600));
      if (code.trim() !== LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP) {
        throw new AppError("invalid_otp", "Incorrect code.");
      }
      if (email.endsWith("@taken.invalid")) {
        throw new AppError(
          "permission_denied",
          "This email is already linked to a Vyaamikk account."
        );
      }
      const profile = {
        uid: "harness-uid",
        ueid: "VD-HARNESS",
        phoneE164: sessionPhone,
        businessEmail: email,
        normalizedEmail: email,
      } as UserProfile;
      return profile;
    },
    onAuthoritativePhone: (profile) => {
      // Bind → central session BEFORE success ack / return (do not navigate here).
      setSessionPhone(profile.phoneE164);
      onCommit?.({ phoneE164: profile.phoneE164 });
      if (__DEV__) {
        console.log("[review-state] contact committed channel=mobile");
      }
    },
    onAuthoritativeEmail: (profile) => {
      const next = profile.normalizedEmail ?? profile.businessEmail ?? sessionEmail;
      setSessionEmail(next);
      onCommit?.({ email: next });
      if (__DEV__) {
        console.log("[review-state] contact committed channel=email");
      }
    },
  };

  useEffect(() => {
    return () => {
      if (pinTimer.current) clearTimeout(pinTimer.current);
    };
  }, []);

  const runLookup = (raw: string) => {
    if (!reviewEditAllowsPinLookup(target)) return;
    if (pinTimer.current) clearTimeout(pinTimer.current);
    if (raw.length !== 6) {
      setPinUi("idle");
      return;
    }
    pinLookupSpy?.();
    setPinUi("looking_up");
    pinTimer.current = setTimeout(() => {
      void (async () => {
        const result = await lookupPostalPincodeApi(raw);
        if (result.classification === "success") {
          if (result.resolution.localities.length > 1 && result.district && result.state) {
            setChoices({
              localities: result.resolution.localities,
              district: result.district,
              state: result.state,
            });
            setConfirmedPin(null);
            setPinUi("choices");
            return;
          }
          setConfirmedPin({
            locality: result.locality,
            district: result.district ?? "",
            state: result.state ?? "",
          });
          setPinUi("confirmed");
          return;
        }
        setConfirmedPin(null);
        setPinUi("not_found");
      })();
    }, 280);
  };

  const primary = () => {
    setError(null);
    if (target === "contacts") {
      // Flush committed contacts into session (idempotent if onCommit already ran).
      onSave({ phoneE164: sessionPhone, email: sessionEmail });
      return;
    }
    if (target === "identity") {
      if (!displayName.trim()) {
        setError("Enter your full legal name.");
        return;
      }
      if (
        !isIndividualProfessionalPractice(constitution) &&
        !businessName.trim()
      ) {
        setError("Enter your business / firm / practice name.");
        return;
      }
      onSave({ displayName, businessName });
      return;
    }
    if (target === "constitution") {
      if (!constitution.trim()) {
        setError("Select a business / practice type.");
        return;
      }
      onSave({ constitution });
      return;
    }
    if (target === "gstin") {
      const normalized = normalizeGstin(gstin);
      const ev = evaluateGstinInput(normalized);
      if (normalized && ev.state === "formatInvalid") {
        setError("Enter a valid 15-character GSTIN, or leave blank.");
        return;
      }
      onSave({ gstin: normalized, gstinState: ev.state });
      return;
    }
    if (target === "media") {
      onSave({ logoUri });
      return;
    }
    if (target === "location") {
      if (!confirmedPin || pinUi !== "confirmed") {
        setError("Confirm your location before continuing.");
        return;
      }
      onSave({ pinCode, confirmedPin });
    }
  };

  const back = () => {
    if (target === "location") {
      onSave({
        pinCode: model.pinCode,
        confirmedPin: locationSnapshot.current,
      });
      return;
    }
    onBack();
  };

  const chooseLogo = async () => {
    setChoosingLogo(true);
    setError(null);
    try {
      if (onPickLogoLocal) {
        const uri = await onPickLogoLocal();
        if (uri) setLogoUri(uri);
      }
    } finally {
      setChoosingLogo(false);
    }
  };

  return (
    <ReviewEditShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      subtitle={copy.subtitle}
      primaryCta={copy.primaryCta}
      onPrimary={primary}
      onBack={back}
      error={error}
      testID={`harness-review-edit-save-${target}`}
    >
      {target === "identity" ? (
        <ReviewIdentityEditFields
          displayName={displayName}
          businessName={businessName}
          constitution={constitution}
          onDisplayNameChange={setDisplayName}
          onBusinessNameChange={setBusinessName}
        />
      ) : null}

      {target === "media" ? (
        <ReviewLogoEditFields
          previewUri={logoUri}
          onChoose={() => void chooseLogo()}
          onRemove={() => setLogoUri(null)}
          choosing={choosingLogo}
        />
      ) : null}

      {target === "contacts" ? (
        <VerifiedContactChangePanel
          phoneE164={sessionPhone}
          email={sessionEmail}
          emailVerified={Boolean(sessionEmail.trim())}
          phoneChangeAvailable={REVIEW_PHONE_CHANGE_AVAILABLE}
          emailChangeAvailable={REVIEW_EMAIL_CHANGE_AVAILABLE}
          adapters={harnessContactAdapters}
        />
      ) : null}

      {target === "gstin" ? (
        <ReviewGstinEditFields
          gstin={gstin}
          gstinState={gstinState}
          onChange={(raw) => {
            const normalized = normalizeGstin(raw);
            const ev = evaluateGstinInput(normalized);
            setGstin(normalized);
            setGstinState(ev.state);
          }}
        />
      ) : null}

      {target === "constitution" ? (
        <ReviewConstitutionEditFields value={constitution} onChange={setConstitution} />
      ) : null}

      {target === "location" ? (
        <View style={styles.form}>
          <OnboardingV2TextField
            navFieldKey="pinCode"
            label="PIN code"
            required
            value={pinCode}
            onChangeText={(v) => {
              const next = v.replace(/\D/g, "").slice(0, 6);
              setPinCode(next);
              setConfirmedPin(null);
              runLookup(next);
            }}
            keyboardType="number-pad"
            maxLength={6}
          />
          {pinUi === "looking_up" ? (
            <View style={styles.lookup}>
              <ActivityIndicator color={tokens.ctaActiveText} />
              <Text style={[styles.hint, { color: tokens.muted }]}>Looking up…</Text>
            </View>
          ) : null}
          {pinUi === "not_found" ? (
            <OnboardingInlineMessage tone="danger" message="Couldn't find this PIN." />
          ) : null}
          {pinUi === "choices" && choices ? (
            <View style={styles.choices}>
              {choices.localities.map((loc) => (
                <Pressable
                  key={loc}
                  onPress={() => {
                    setConfirmedPin({
                      locality: loc,
                      district: choices.district,
                      state: choices.state,
                    });
                    setPinUi("confirmed");
                  }}
                  style={[styles.chip, { backgroundColor: tokens.cardBg }]}
                >
                  <Text style={{ color: tokens.body, ...typography.caption }}>{loc}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {pinUi === "confirmed" && confirmedPin ? (
            <LocationConfirmationCard
              locality={confirmedPin.locality}
              district={confirmedPin.district}
              state={confirmedPin.state}
              confirmed
            />
          ) : null}
          {pinUi === "choices" ? (
            <AuthV2SecondaryButton
              label="Confirm location"
              disabled={!confirmedPin}
              onPress={() => setPinUi("confirmed")}
            />
          ) : null}
        </View>
      ) : null}
    </ReviewEditShell>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm },
  hint: { ...typography.caption, lineHeight: 18 },
  lookup: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
});
