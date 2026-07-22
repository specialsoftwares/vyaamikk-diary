import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { AuthV2SecondaryButton } from "@/auth-v2/components/AuthV2SecondaryButton";
import { OnboardingV2Shell } from "@/auth-v2/components/OnboardingV2Shell";
import { OnboardingV2TextField } from "@/auth-v2/components/OnboardingV2TextField";
import { WizardProgress } from "@/auth-v2/components/WizardProgress";
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
  clearOnboardingProfileDraftV2,
  loadOnboardingProfileDraftV2,
  saveOnboardingProfileDraftV2,
} from "@/onboarding/onboardingProfileDraftV2";
import { transformProfileDraftV2ForAccountKind } from "@/onboarding/transformProfileDraftV2";
import {
  validateOnboardingDraftForCompletion,
  type OnboardingProfileDraftV2,
} from "@/onboarding/profileIdentityModel";
import {
  evaluateGstinInput,
  gstinUserFacingLabel,
} from "@/onboarding/gstinVerificationState";
import {
  acceptPinInput,
  applyPinLookupResult,
  confirmPinLocation,
  nextPinLookupRequestId,
  type PinLookupUiState,
} from "@/onboarding/pinConfirmation";
import {
  confirmAndPersistIdentityMedia,
  IdentityMediaError,
  pickIdentityMedia,
} from "@/onboarding/identityMedia";
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
  const [mediaBusy, setMediaBusy] = useState(false);
  const [pinUi, setPinUi] = useState<PinLookupUiState>({ status: "idle" });
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
        user.accountKind === "individual" || user.accountKind === "business"
          ? user.accountKind
          : "business";
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
            syncDraft({
              ...current,
              pinLocalityChoices: next.locality ? [next.locality] : [],
              selectedLocality: next.locality,
              confirmedLocation: null,
            });
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

  const switchAccountKind = (nextKind: OnboardingAccountKind) => {
    if (nextKind === accountKind || readOnly) return;
    const current = draftRef.current!;
    const { draft: transformed, clearedMeaningful } =
      transformProfileDraftV2ForAccountKind(current, nextKind);
    const apply = () => {
      syncDraft(transformed);
      void saveOnboardingProfileDraftV2(transformed);
    };
    if (clearedMeaningful) {
      Alert.alert(
        "Switch to Individual?",
        "Business name, constitution, and GSTIN will be cleared from this draft.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Switch", style: "destructive", onPress: apply },
        ]
      );
      return;
    }
    apply();
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
    const { normalized, state } = evaluateGstinInput(raw);
    // Preserve raw when invalid/whitespace so format checks stay honest; otherwise store normalized.
    const stored =
      state === "formatInvalid" || state === "notProvided"
        ? raw.toUpperCase().slice(0, 20)
        : normalized;
    patchDraft({
      gstin: stored,
      gstinVerificationState: state,
    });
  };

  const onPickMedia = async (source: "camera" | "library") => {
    if (readOnly || mediaBusy) return;
    setMediaBusy(true);
    setServerError(null);
    try {
      const asset = await pickIdentityMedia(source);
      // Preview first; durable flag only after persist.
      patchDraft({
        logoPreviewUri: asset.uri,
        logoPersisted: false,
      });
      const persisted = await confirmAndPersistIdentityMedia(user.uid, asset);
      patchDraft({
        profileLogo: persisted,
        logoPreviewUri: persisted.localUri,
        logoPersisted: true,
      });
    } catch (e) {
      if (e instanceof IdentityMediaError && e.reason === "cancelled") {
        return;
      }
      // Keep non-image fields; reset only media persistence flags if persist failed mid-way.
      const current = draftRef.current;
      if (current && !current.logoPersisted) {
        patchDraft({
          logoPreviewUri: current.profileLogo?.localUri ?? null,
        });
      }
      setServerError(
        e instanceof IdentityMediaError ? e.message : userFacingMessage(e)
      );
    } finally {
      setMediaBusy(false);
    }
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

  const previewUri = draft.logoPreviewUri ?? draft.profileLogo?.localUri ?? null;
  const nameLabel =
    accountKind === "business"
      ? "Account owner's full legal name"
      : "Full legal name";
  const mediaLabel = accountKind === "business" ? "Business logo" : "Profile image";

  const pinStatusMessage = (() => {
    switch (pinUi.status) {
      case "looking_up":
        return "Looking up PIN…";
      case "invalid_format":
        return "Enter a valid 6-digit PIN.";
      case "not_found":
        return "PIN not found. Check the code and try again.";
      case "unavailable":
        return "PIN lookup unavailable. Try again shortly.";
      case "choices":
        return "Select your locality, then confirm.";
      case "ready_to_confirm":
        return `${pinUi.locality ? `${pinUi.locality}, ` : ""}${pinUi.district}, ${pinUi.state}`;
      case "confirmed":
        return `${pinUi.location.locality ? `${pinUi.location.locality}, ` : ""}${pinUi.location.district}, ${pinUi.location.state}`;
      default:
        return null;
    }
  })();

  const canConfirmPin =
    pinUi.status === "ready_to_confirm" ||
    (pinUi.status === "choices" && Boolean(draft.selectedLocality));

  return (
    <OnboardingV2Shell
      stageLabel={t("onboarding.stages.buildIdentity")}
      title={t("onboarding.stages.buildIdentity")}
      subtitle={t("onboarding.profile.v2Body")}
      onBack={goBack}
      headerTop={
        <WizardProgress
          step="businessIdentity"
          tone="dark"
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
          />
        ) : (
          <>
            {serverError ? <Banner tone="danger" message={serverError} /> : null}
            <AuthV2PrimaryButton
              label={t("onboarding.profile.continue")}
              loading={submitting}
              loadingLabel={t("authV2.email.saving")}
              disabled={submitting || mediaBusy}
              onPress={() => void onContinue()}
              testID="complete-profile-continue"
              activeBg={tokens.ctaActiveBg}
              activeText={tokens.ctaActiveText}
              mutedBg={tokens.ctaMutedBg}
              mutedText={tokens.ctaMutedText}
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

      {!readOnly ? (
        <View style={styles.kindRow}>
          {(["individual", "business"] as const).map((kind) => {
            const active = accountKind === kind;
            return (
              <Pressable
                key={kind}
                onPress={() => switchAccountKind(kind)}
                style={[
                  styles.kindChip,
                  {
                    backgroundColor: active ? tokens.ctaActiveBg : tokens.cardBg,
                    borderColor: tokens.cardBorder,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={{
                    color: active ? tokens.ctaActiveText : tokens.body,
                    ...typography.captionStrong,
                  }}
                >
                  {kind === "individual" ? "Individual" : "Business"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View
        style={[styles.form, readOnly && styles.readOnly]}
        pointerEvents={readOnly ? "none" : "auto"}
      >
        <OnboardingV2TextField
          navFieldKey="displayName"
          label={nameLabel}
          required
          value={draft.displayName}
          onChangeText={(v) => patchDraft({ displayName: v })}
          placeholder="Full legal name"
          autoCapitalize="words"
          maxLength={80}
          editable={!readOnly}
        />

        {accountKind === "business" ? (
          <>
            <OnboardingV2TextField
              navFieldKey="businessName"
              label="Legal business name"
              required
              value={draft.businessName}
              onChangeText={(v) => patchDraft({ businessName: v })}
              placeholder="Registered business name"
              autoCapitalize="words"
              maxLength={120}
              editable={!readOnly}
            />
            <OnboardingV2TextField
              navFieldKey="constitution"
              label="Constitution (optional)"
              value={draft.constitution}
              onChangeText={(v) => patchDraft({ constitution: v })}
              placeholder="e.g. Proprietorship, Private Limited"
              autoCapitalize="words"
              maxLength={120}
              editable={!readOnly}
            />
            <OnboardingV2TextField
              navFieldKey="gstin"
              label="GSTIN (optional)"
              value={draft.gstin}
              onChangeText={onGstinChange}
              placeholder="15-character GSTIN"
              autoCapitalize="characters"
              maxLength={20}
              editable={!readOnly}
            />
            {draft.gstin.trim() ? (
              <Text style={[styles.helper, { color: tokens.muted }]}>
                {gstinUserFacingLabel(draft.gstinVerificationState)}
              </Text>
            ) : null}
          </>
        ) : null}

        <View style={styles.sectionGap}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{mediaLabel}</Text>
          <View style={styles.mediaRow}>
            <View
              style={[
                styles.mediaPreview,
                { backgroundColor: tokens.cardBg, borderColor: tokens.cardBorder },
              ]}
            >
              {previewUri ? (
                <Image source={{ uri: previewUri }} style={styles.mediaImage} />
              ) : (
                <Text style={[styles.mediaPlaceholder, { color: tokens.muted }]}>
                  No image
                </Text>
              )}
              {mediaBusy ? (
                <View style={styles.mediaBusy}>
                  <ActivityIndicator color={tokens.ctaActiveText} />
                </View>
              ) : null}
            </View>
            <View style={styles.mediaActions}>
              <AuthV2SecondaryButton
                label="Camera"
                disabled={readOnly || mediaBusy}
                onPress={() => void onPickMedia("camera")}
              />
              <AuthV2SecondaryButton
                label="Gallery"
                disabled={readOnly || mediaBusy}
                onPress={() => void onPickMedia("library")}
              />
              {draft.logoPersisted ? (
                <Text style={[styles.helper, { color: tokens.muted }]}>Saved on device</Text>
              ) : previewUri ? (
                <Text style={[styles.helper, { color: tokens.danger }]}>
                  Image not saved yet
                </Text>
              ) : null}
            </View>
          </View>
        </View>

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
        {pinStatusMessage ? (
          <Text style={[styles.helper, { color: tokens.muted }]}>{pinStatusMessage}</Text>
        ) : null}

        {pinUi.status === "choices" ? (
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
        ) : null}

        {canConfirmPin || pinUi.status === "confirmed" ? (
          <View style={styles.confirmRow}>
            {pinUi.status === "confirmed" ? (
              <Banner
                tone="info"
                message={`Confirmed: ${pinUi.location.district}, ${pinUi.location.state}`}
              />
            ) : (
              <AuthV2SecondaryButton
                label="Confirm location"
                disabled={readOnly || !canConfirmPin}
                onPress={onConfirmPin}
              />
            )}
          </View>
        ) : null}
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
  localityList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
  localityChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  confirmRow: { marginBottom: spacing.md, gap: spacing.sm },
});
