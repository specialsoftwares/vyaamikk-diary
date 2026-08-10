import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { AuthV2SecondaryButton } from "@/auth-v2/components/AuthV2SecondaryButton";
import { BusinessConstitutionField } from "@/auth-v2/components/BusinessConstitutionField";
import { LocationConfirmationCard } from "@/auth-v2/components/LocationConfirmationCard";
import { OnboardingInlineMessage } from "@/auth-v2/components/OnboardingInlineMessage";
import { OnboardingV2Shell } from "@/auth-v2/components/OnboardingV2Shell";
import { OnboardingV2TextField } from "@/auth-v2/components/OnboardingV2TextField";
import { WizardProgress } from "@/auth-v2/components/WizardProgress";
import {
  deriveIdentityPhaseFromDraft,
  type IdentityPhase,
} from "@/auth-v2/onboardingJourney";
import { onboardingMark, onboardingMeasure } from "@/auth-v2/onboardingPerfProbe";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { isOnboardingIdentityLocked } from "@/domain/profileUpdatePolicy";
import { Banner } from "@/components/ui";
import { userFacingMessage } from "@/domain/errors";
import { hasAuthoritativeVerifiedEmail } from "@/auth/identityRouteState";
import {
  markContinuingWizardStep,
  markReviewingWizardStep,
} from "@/auth/onboardingGuardPolicy";
import type { OnboardingAccountKind } from "@/auth/onboardingWizard";
import {
  isIndividualProfessionalPractice,
  NEW_REGISTRATION_ACCOUNT_KIND,
} from "@/onboarding/businessConstitution";
import {
  clearOnboardingProfileDraftV2,
  loadOnboardingProfileDraftV2,
  saveOnboardingProfileDraftV2,
} from "@/onboarding/onboardingProfileDraftV2";
import {
  isIdentityContinueEnabled,
  isIdentityDetailsContinueEnabled,
  validateOnboardingDraftForCompletion,
  type OnboardingProfileDraftV2,
} from "@/onboarding/profileIdentityModel";
import { evaluateGstinInput } from "@/onboarding/gstinVerificationState";
import { normalizeGstin } from "@/utils/gst/gstin";
import {
  acceptPinInput,
  applyPinLookupResult,
  confirmPinLocation,
  nextPinLookupRequestId,
  type PinLookupUiState,
} from "@/onboarding/pinConfirmation";
import { resolveIndianPincode } from "@/services/location/pincodeResolver";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { spacing, typography } from "@/theme";
import { maskMobile } from "@/utils/phone";

export type BusinessIdentitySection =
  | "identity"
  | "media"
  | "contacts"
  | "location"
  | "gstin"
  | "constitution";

interface BusinessIdentityScreenProps {
  initialSection?: BusinessIdentitySection | string | null;
}

const AUTOSAVE_MS = 800;
const PIN_LOOKUP_DEBOUNCE_MS = 400;

export function BusinessIdentityScreen({
  initialSection: _initialSection = null,
}: BusinessIdentityScreenProps = {}) {
  const t = useT();
  const router = useRouter();
  const { tokens } = useAuthV2Theme();
  const { user, signOut } = useAuth();
  const [draft, setDraft] = useState<OnboardingProfileDraftV2 | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const mediaBusy = false;
  const [pinUi, setPinUi] = useState<PinLookupUiState>({ status: "idle" });
  const [identityPhase, setIdentityPhase] = useState<IdentityPhase>("details");
  const [ready, setReady] = useState(false);

  const draftRef = useRef<OnboardingProfileDraftV2 | null>(null);
  const latestPinRequestIdRef = useRef(0);
  const pinLookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const readOnly = user ? isOnboardingIdentityLocked(user) : false;

  const syncDraft = useCallback((next: OnboardingProfileDraftV2) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        router.replace("/");
        return;
      }
      const preferred: OnboardingAccountKind =
        user.profileCompletedAt && user.accountKind === "individual"
          ? "individual"
          : NEW_REGISTRATION_ACCOUNT_KIND;
      let loaded = await loadOnboardingProfileDraftV2(user.uid, preferred);
      if (
        preferred === "business" &&
        !loaded.displayName.trim() &&
        !loaded.businessName.trim()
      ) {
        const individual = await loadOnboardingProfileDraftV2(user.uid, "individual");
        if (individual.displayName.trim() || individual.updatedAt > loaded.updatedAt) {
          loaded = individual;
        }
      }
      if (cancelled) return;
      if (!user.profileCompletedAt && loaded.accountKind !== NEW_REGISTRATION_ACCOUNT_KIND) {
        loaded = { ...loaded, accountKind: NEW_REGISTRATION_ACCOUNT_KIND };
      }
      if (!loaded.displayName.trim() && user.displayName?.trim()) {
        loaded = { ...loaded, displayName: user.displayName.trim() };
      }
      if (
        loaded.accountKind === "business" &&
        !loaded.businessName.trim() &&
        user.businessName?.trim()
      ) {
        loaded = { ...loaded, businessName: user.businessName.trim() };
      }
      syncDraft(loaded);
      if (loaded.confirmedLocation && loaded.confirmedLocation.pinCode === loaded.pinCode) {
        setPinUi({ status: "confirmed", location: loaded.confirmedLocation });
      } else if (loaded.pinCode.length === 6) {
        setPinUi({ status: "idle" });
      }
      setIdentityPhase(
        deriveIdentityPhaseFromDraft({
          displayName: loaded.displayName,
          accountKind: loaded.accountKind,
          businessName: loaded.businessName,
          confirmedLocationPin: loaded.confirmedLocation?.pinCode ?? null,
          pinCode: loaded.pinCode,
        })
      );
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, router, syncDraft, user]);

  useEffect(() => {
    if (!user || readOnly || !draft) return;
    const sub = setInterval(() => {
      const current = draftRef.current;
      if (!current || current.uid !== user.uid) return;
      void saveOnboardingProfileDraftV2(current);
    }, AUTOSAVE_MS);
    return () => clearInterval(sub);
  }, [user, readOnly, draft?.accountKind]);

  useEffect(() => {
    return () => {
      if (pinLookupTimerRef.current) clearTimeout(pinLookupTimerRef.current);
    };
  }, []);

  const persistDraftNow = async () => {
    const current = draftRef.current;
    if (!current) return;
    await saveOnboardingProfileDraftV2(current);
  };

  const runPinLookup = useCallback(
    (pinCode: string) => {
      if (pinLookupTimerRef.current) clearTimeout(pinLookupTimerRef.current);
      if (pinCode.length !== 6) {
        setPinUi(pinCode.length === 0 ? { status: "idle" } : { status: "invalid_format" });
        return;
      }
      pinLookupTimerRef.current = setTimeout(() => {
        const requestId = nextPinLookupRequestId();
        latestPinRequestIdRef.current = requestId;
        onboardingMark("lookupStarted");
        setPinUi({ status: "looking_up", requestId, pinCode });
        void (async () => {
          const resolution = await resolveIndianPincode(pinCode);
          const current = draftRef.current;
          const next = applyPinLookupResult({
            requestId,
            latestRequestId: latestPinRequestIdRef.current,
            pinCode,
            currentPinCode: current?.pinCode ?? "",
            resolution,
          });
          if (!next) return;
          setPinUi(next);
          if (next.status === "choices" && current) {
            syncDraft({
              ...current,
              pinLocalityChoices: next.localities,
              selectedLocality: null,
              confirmedLocation: null,
            });
          } else if (next.status === "ready_to_confirm" && current) {
            const location = confirmPinLocation({
              pinCode: next.pinCode,
              locality: next.locality,
              district: next.district,
              state: next.state,
              source: next.source,
            });
            syncDraft({
              ...current,
              pinLocalityChoices: next.locality ? [next.locality] : [],
              selectedLocality: next.locality,
              confirmedLocation: location,
              pinCode: location.pinCode,
            });
            setPinUi({ status: "confirmed", location });
            onboardingMark("confirmationRendered");
            return;
          } else if (
            (next.status === "not_found" || next.status === "unavailable") &&
            current
          ) {
            syncDraft({
              ...current,
              pinLocalityChoices: [],
              selectedLocality: null,
              confirmedLocation: null,
            });
          }
        })();
      }, PIN_LOOKUP_DEBOUNCE_MS);
    },
    [syncDraft]
  );

  if (!user || !ready || !draft) {
    return null;
  }

  const accountKind = draft.accountKind;

  const patchDraft = (partial: Partial<OnboardingProfileDraftV2>) => {
    const next = { ...draftRef.current!, ...partial, updatedAt: Date.now() };
    syncDraft(next);
  };

  const onPinChange = (raw: string) => {
    if (readOnly) return;
    const accepted = acceptPinInput(raw);
    if (accepted === null) return;
    const pinChanged = accepted !== draft.pinCode;
    patchDraft(
      pinChanged
        ? {
            pinCode: accepted,
            confirmedLocation: null,
            selectedLocality: null,
            pinLocalityChoices: [],
          }
        : { pinCode: accepted }
    );
    if (pinChanged) {
      setPinUi({ status: "idle" });
      if (accepted.length === 6) onboardingMark("pinValid");
      runPinLookup(accepted);
    }
  };

  const selectLocality = (locality: string) => {
    if (readOnly) return;
    patchDraft({ selectedLocality: locality, confirmedLocation: null });
    if (pinUi.status === "choices") {
      setPinUi({
        status: "ready_to_confirm",
        requestId: pinUi.requestId,
        pinCode: pinUi.pinCode,
        locality,
        district: pinUi.district,
        state: pinUi.state,
        source: pinUi.source,
      });
    }
  };

  const onConfirmPin = () => {
    if (readOnly) return;
    if (pinUi.status !== "ready_to_confirm" && pinUi.status !== "choices") return;
    const locality =
      pinUi.status === "ready_to_confirm"
        ? pinUi.locality
        : draft.selectedLocality;
    if (pinUi.status === "choices" && !locality) {
      setServerError("Select a locality, then confirm.");
      return;
    }
    const location = confirmPinLocation({
      pinCode: pinUi.pinCode,
      locality,
      district: pinUi.district,
      state: pinUi.state,
      source: pinUi.source,
    });
    patchDraft({
      confirmedLocation: location,
      selectedLocality: locality,
      pinCode: location.pinCode,
    });
    setPinUi({ status: "confirmed", location });
    setServerError(null);
  };

  const onGstinChange = (raw: string) => {
    if (readOnly) return;
    const normalized = normalizeGstin(raw);
    const { state } = evaluateGstinInput(normalized);
    patchDraft({
      gstin: normalized,
      gstinVerificationState: state,
    });
  };

  const onContinue = async () => {
    setServerError(null);
    const current = draftRef.current;
    if (!current) return;
    const email = user.normalizedEmail ?? user.businessEmail ?? "";
    const validation = validateOnboardingDraftForCompletion({
      signedIn: true,
      emailVerified:
        user.emailStatus === "verified" && Boolean(user.emailVerifiedAt),
      phoneE164: user.phoneE164,
      email,
      draft: current,
    });
    if (!validation.ok) {
      setServerError(validation.message);
      return;
    }
    setSubmitting(true);
    try {
      await saveOnboardingProfileDraftV2(current);
      markContinuingWizardStep("profileReview", user.uid, {
        phoneE164: user.phoneE164,
        verifiedEmail: user.normalizedEmail ?? user.businessEmail,
      });
      router.replace("/(auth)/profile-review");
    } catch (e) {
      setServerError(userFacingMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    if (identityPhase === "location" && !readOnly) {
      setIdentityPhase("details");
      return;
    }
    // Sync review intent BEFORE route replace — eliminates AsyncStorage race.
    markReviewingWizardStep("emailEntry", user.uid, {
      phoneE164: user.phoneE164,
      verifiedEmail: hasAuthoritativeVerifiedEmail(user)
        ? user.normalizedEmail ?? user.businessEmail
        : null,
    });
    router.replace({
      pathname: "/(auth)/v2",
      params: { step: "email", intent: "review", from: "profile" },
    });
    void persistDraftNow();
  };

  const goBackFromReadOnly = () => {
    markContinuingWizardStep("ueidRelease", user.uid);
    router.replace("/(auth)/ueid");
  };

  const abandon = () => {
    Alert.alert(
      "Sign out and start again?",
      "This abandons the current incomplete registration on this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const { clearWizardNavigationSession } = await import(
                "@/auth/onboardingGuardPolicy"
              );
              clearWizardNavigationSession();
              await clearOnboardingProfileDraftV2(user.uid);
              await signOut();
              router.replace("/(auth)/v2");
            })();
          },
        },
      ]
    );
  };

  const pinStatusMessage = (() => {
    switch (pinUi.status) {
      case "looking_up":
      case "choices":
      case "ready_to_confirm":
        // Dedicated confirmation / spinner UI renders these states.
        return null;
      case "invalid_format":
        return "Enter a valid 6-digit PIN.";
      case "not_found":
        return "Couldn't find this PIN. Check and try again.";
      case "unavailable":
        return "Couldn't look up the PIN right now. Try again.";
      case "confirmed":
        return null;
      default:
        return null;
    }
  })();

  const canConfirmPin =
    pinUi.status === "ready_to_confirm" ||
    (pinUi.status === "choices" && Boolean(draft.selectedLocality));

  const detailsEnabled = isIdentityDetailsContinueEnabled({
    displayName: draft.displayName,
    accountKind,
    businessName: draft.businessName,
    constitution: draft.constitution,
    gstin: draft.gstin,
    gstinVerificationState: draft.gstinVerificationState,
    submitting,
  });
  const continueEnabled = isIdentityContinueEnabled({
    submitting,
    mediaBusy,
    pinStatus: pinUi.status,
    confirmedLocation: draft.confirmedLocation,
    pinCode: draft.pinCode,
  });

  const onDetailsContinue = () => {
    if (!detailsEnabled) return;
    onboardingMark("identityContinueTap");
    void persistDraftNow();
    setIdentityPhase("location");
    onboardingMeasure("identityContinueTap", "identityContinueTap", "identityContinueTap → locationVisible");
  };

  return (
    <OnboardingV2Shell
      stageLabel={t("onboarding.stages.buildIdentity")}
      title={
        identityPhase === "location"
          ? "Confirm your location"
          : "Tell us about your business or practice"
      }
      subtitle={
        identityPhase === "location"
          ? "Enter your 6-digit PIN. We'll confirm the place."
          : "These details help Vyaamikk identify your business, firm or professional practice on records and documents."
      }
      onBack={goBack}
      headerTop={
        <WizardProgress
          step="businessIdentity"
          tone="dark"
          identityPhase={identityPhase}
          verifiedMobile
          verifiedEmail={hasAuthoritativeVerifiedEmail(user)}
        />
      }
      footer={
        readOnly ? (
          <AuthV2PrimaryButton
            label={t("common.back")}
            onPress={goBackFromReadOnly}
            activeBg={tokens.ctaActiveBg}
            activeText={tokens.ctaActiveText}
            mutedBg={tokens.ctaMutedBg}
            mutedText={tokens.ctaMutedText}
            mutedBorder={tokens.ctaMutedBorder}
          />
        ) : (
          <>
            {serverError ? (
              <OnboardingInlineMessage tone="danger" message={serverError} />
            ) : null}
            <AuthV2PrimaryButton
              label={t("onboarding.profile.continue")}
              loading={submitting}
              loadingLabel={t("authV2.email.saving")}
              disabled={identityPhase === "details" ? !detailsEnabled : !continueEnabled}
              onPress={() =>
                identityPhase === "details" ? onDetailsContinue() : void onContinue()
              }
              testID="complete-profile-continue"
              activeBg={tokens.ctaActiveBg}
              activeText={tokens.ctaActiveText}
              mutedBg={tokens.ctaMutedBg}
              mutedText={tokens.ctaMutedText}
            mutedBorder={tokens.ctaMutedBorder}
            />
            <Text style={[styles.note, { color: tokens.muted }]}>
              {t("onboarding.profile.mobileNote", { phone: maskMobile(user.phoneE164) })}
            </Text>
            <Pressable onPress={abandon} accessibilityRole="button">
              <Text style={[styles.signOut, { color: tokens.muted }]}>
                Sign out and start again
              </Text>
            </Pressable>
          </>
        )
      }
    >
      {readOnly ? (
        <Banner tone="info" message={t("onboarding.profile.lockedAfterUeid")} />
      ) : null}

      <View
        style={[styles.form, readOnly && styles.readOnly]}
        pointerEvents={readOnly ? "none" : "auto"}
      >
        {identityPhase === "details" ? (
          <>
            <OnboardingV2TextField
              navFieldKey="displayName"
              label="Your full legal name"
              required
              value={draft.displayName}
              onChangeText={(v) => patchDraft({ displayName: v })}
              placeholder="Account owner / authorised person"
              autoCapitalize="words"
              maxLength={80}
              editable={!readOnly}
            />
            <OnboardingV2TextField
              navFieldKey="businessName"
              label={
                isIndividualProfessionalPractice(draft.constitution)
                  ? "Practice / professional name"
                  : "Business / firm / practice name"
              }
              required={!isIndividualProfessionalPractice(draft.constitution)}
              value={draft.businessName}
              onChangeText={(v) => patchDraft({ businessName: v })}
              placeholder={
                isIndividualProfessionalPractice(draft.constitution)
                  ? "e.g. Shivam Saurav, Advocate"
                  : "e.g. Sharma Hardware"
              }
              autoCapitalize="words"
              maxLength={120}
              editable={!readOnly}
            />
            <BusinessConstitutionField
              value={draft.constitution}
              onChange={(v) => patchDraft({ constitution: v })}
              disabled={readOnly}
            />
            <OnboardingV2TextField
              navFieldKey="gstin"
              label="GSTIN (optional)"
              value={draft.gstin}
              onChangeText={onGstinChange}
              placeholder="15-character GSTIN"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={15}
              editable={!readOnly}
            />
            {draft.gstin.trim() && draft.gstinVerificationState === "formatInvalid" ? (
              <Text style={[styles.helper, { color: tokens.danger }]}>
                Enter a valid 15-character GSTIN, or leave blank.
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <OnboardingV2TextField
              navFieldKey="pinCode"
              label="PIN code"
              required
              value={draft.pinCode}
              onChangeText={onPinChange}
              placeholder="6-digit PIN"
              keyboardType={"number-pad" as "default"}
              maxLength={6}
              editable={!readOnly}
            />
            {pinUi.status === "looking_up" ? (
              <View style={styles.pinLookupRow}>
                <ActivityIndicator color={tokens.ctaActiveText} />
                <Text style={[styles.helper, { color: tokens.muted, marginTop: 0 }]}>
                  Looking up…
                </Text>
              </View>
            ) : pinStatusMessage ? (
              <OnboardingInlineMessage tone="muted" message={pinStatusMessage} />
            ) : null}

            {pinUi.status === "choices" ? (
              <View style={styles.pinConfirmCard}>
                <Text style={[styles.sectionLabel, { color: tokens.body }]}>
                  Select your locality
                </Text>
                <View style={styles.localityList}>
                  {pinUi.localities.map((loc) => {
                    const selected = draft.selectedLocality === loc;
                    return (
                      <Pressable
                        key={loc}
                        onPress={() => selectLocality(loc)}
                        style={[
                          styles.localityChip,
                          {
                            backgroundColor: selected ? tokens.ctaActiveBg : tokens.cardBg,
                            borderColor: tokens.cardBorder,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <Text
                          style={{
                            color: selected ? tokens.ctaActiveText : tokens.body,
                            ...typography.caption,
                          }}
                        >
                          {loc}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <AuthV2SecondaryButton
                  label="Confirm location"
                  disabled={readOnly || !canConfirmPin}
                  onPress={onConfirmPin}
                />
              </View>
            ) : null}

            {pinUi.status === "ready_to_confirm" ? (
              <LocationConfirmationCard
                locality={pinUi.locality}
                district={pinUi.district}
                state={pinUi.state}
                confirmed={false}
              />
            ) : null}

            {pinUi.status === "confirmed" ? (
              <LocationConfirmationCard
                locality={pinUi.location.locality}
                district={pinUi.location.district}
                state={pinUi.location.state}
                confirmed
              />
            ) : null}
          </>
        )}
      </View>
    </OnboardingV2Shell>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm, marginTop: spacing.sm },
  readOnly: { opacity: 0.72 },
  note: { ...typography.caption, textAlign: "center", lineHeight: 18 },
  signOut: {
    ...typography.caption,
    textAlign: "center",
    textDecorationLine: "underline",
    marginTop: spacing.xs,
  },
  kindRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  kindChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  helper: { ...typography.caption, marginTop: -spacing.xs, marginBottom: spacing.sm },
  sectionGap: { gap: spacing.sm, marginBottom: spacing.md },
  sectionLabel: { ...typography.captionStrong },
  mediaRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  mediaPreview: {
    width: 88,
    height: 88,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mediaImage: { width: "100%", height: "100%" },
  mediaPlaceholder: { ...typography.caption, textAlign: "center", padding: spacing.xs },
  mediaBusy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  mediaActions: { flex: 1, gap: spacing.sm },
  pinLookupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pinConfirmCard: {
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  localityList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  localityChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  confirmRow: { marginBottom: spacing.md, gap: spacing.sm },
});
