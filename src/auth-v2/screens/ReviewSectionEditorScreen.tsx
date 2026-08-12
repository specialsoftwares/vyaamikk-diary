import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AuthV2SecondaryButton } from "@/auth-v2/components/AuthV2SecondaryButton";
import { LocationConfirmationCard } from "@/auth-v2/components/LocationConfirmationCard";
import { OnboardingInlineMessage } from "@/auth-v2/components/OnboardingInlineMessage";
import { OnboardingV2TextField } from "@/auth-v2/components/OnboardingV2TextField";
import { ReviewEditShell } from "@/auth-v2/components/ReviewEditShell";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import {
  VerifiedContactChangePanel,
  type ContactChangeAdapters,
} from "@/auth-v2/contactChange/VerifiedContactChangePanel";
import {
  type ContactChangePhase,
} from "@/auth-v2/contactChange/contactChangeModel";
import {
  REVIEW_EMAIL_CHANGE_AVAILABLE,
  REVIEW_PHONE_CHANGE_AVAILABLE,
  reviewEditCopy,
} from "@/auth-v2/reviewEditCopy";
import {
  reviewEditAllowsPinLookup,
  reviewEditReturnsToHref,
  type ReviewEditTarget,
} from "@/auth-v2/reviewEditIntent";
import {
  ReviewConstitutionEditFields,
  ReviewGstinEditFields,
  ReviewIdentityEditFields,
  ReviewLogoEditFields,
} from "@/auth-v2/screens/reviewEdit/ReviewEditSectionViews";
import { hasAuthoritativeVerifiedEmail } from "@/auth/identityRouteState";
import { markReviewingWizardStep } from "@/auth/onboardingGuardPolicy";
import { userFacingMessage } from "@/domain/errors";
import {
  assertContactPropagated,
  reviewContactsFromAuthoritativeProfile,
} from "@/auth-v2/reviewMutationPropagation";
import { isIndividualProfessionalPractice } from "@/onboarding/businessConstitution";
import {
  confirmAndPersistIdentityMedia,
  pickIdentityMedia,
} from "@/onboarding/identityMedia";
import { evaluateGstinInput } from "@/onboarding/gstinVerificationState";
import {
  loadOnboardingProfileDraftV2,
  saveOnboardingProfileDraftV2,
} from "@/onboarding/onboardingProfileDraftV2";
import type { OnboardingProfileDraftV2 } from "@/onboarding/profileIdentityModel";
import {
  acceptPinInput,
  applyPinLookupResult,
  confirmPinLocation,
  nextPinLookupRequestId,
  type PinLookupUiState,
} from "@/onboarding/pinConfirmation";
import { removeProfileLogoFile } from "@/services/profileLogo/storage";
import { resolveIndianPincode } from "@/services/location/pincodeResolver";
import {
  confirmVerifiedEmailChange,
  confirmVerifiedPhoneChange,
  resendVerifiedEmailChange,
  startVerifiedEmailChange,
  startVerifiedPhoneChange,
} from "@/services/auth/verifiedContactChange";
import { useAuth } from "@/state/auth";
import { spacing, typography } from "@/theme";
import { normalizeGstin } from "@/utils/gst/gstin";

const PIN_LOOKUP_DEBOUNCE_MS = 400;

interface ReviewSectionEditorScreenProps {
  target: ReviewEditTarget;
}

/**
 * Production Review-targeted section editor.
 * Save/Back → Profile Review. No wizard fall-through.
 */
export function ReviewSectionEditorScreen({ target }: ReviewSectionEditorScreenProps) {
  const router = useRouter();
  const { tokens } = useAuthV2Theme();
  const { user, applyServerProfile, updateProfile } = useAuth();
  const copy = reviewEditCopy(target);
  const [draft, setDraft] = useState<OnboardingProfileDraftV2 | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [choosingLogo, setChoosingLogo] = useState(false);
  const [pinUi, setPinUi] = useState<PinLookupUiState>({ status: "idle" });
  const [contactPhase, setContactPhase] = useState<ContactChangePhase>("overview");
  void contactPhase;

  const draftRef = useRef<OnboardingProfileDraftV2 | null>(null);
  const pinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinRequestId = useRef(0);
  const locationSnapshotRef = useRef<OnboardingProfileDraftV2["confirmedLocation"]>(null);

  const syncDraft = useCallback((next: OnboardingProfileDraftV2) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const returnToReview = useCallback(() => {
    router.replace(reviewEditReturnsToHref());
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        router.replace("/");
        return;
      }
      const kind =
        user.accountKind === "individual" || user.accountKind === "business"
          ? user.accountKind
          : "business";
      const loaded = await loadOnboardingProfileDraftV2(user.uid, kind);
      if (cancelled) return;
      syncDraft(loaded);
      locationSnapshotRef.current = loaded.confirmedLocation;
      if (
        target === "location" &&
        loaded.confirmedLocation &&
        loaded.confirmedLocation.pinCode === loaded.pinCode
      ) {
        setPinUi({ status: "confirmed", location: loaded.confirmedLocation });
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (pinTimer.current) clearTimeout(pinTimer.current);
    };
  }, [user, router, syncDraft, target]);

  const patchDraft = (partial: Partial<OnboardingProfileDraftV2>) => {
    const current = draftRef.current;
    if (!current) return;
    syncDraft({ ...current, ...partial, updatedAt: Date.now() });
  };

  const runPinLookup = useCallback(
    (pinCode: string) => {
      if (!reviewEditAllowsPinLookup(target)) return;
      if (pinTimer.current) clearTimeout(pinTimer.current);
      if (pinCode.length !== 6) {
        setPinUi(pinCode.length === 0 ? { status: "idle" } : { status: "invalid_format" });
        return;
      }
      pinTimer.current = setTimeout(() => {
        const requestId = nextPinLookupRequestId();
        pinRequestId.current = requestId;
        setPinUi({ status: "looking_up", requestId, pinCode });
        void (async () => {
          const resolution = await resolveIndianPincode(pinCode);
          const current = draftRef.current;
          const next = applyPinLookupResult({
            requestId,
            latestRequestId: pinRequestId.current,
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
              updatedAt: Date.now(),
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
              updatedAt: Date.now(),
            });
            setPinUi({ status: "confirmed", location });
          } else if (
            (next.status === "not_found" || next.status === "unavailable") &&
            current
          ) {
            syncDraft({
              ...current,
              confirmedLocation: null,
              selectedLocality: null,
              updatedAt: Date.now(),
            });
          }
        })();
      }, PIN_LOOKUP_DEBOUNCE_MS);
    },
    [target, syncDraft]
  );

  const onPinChange = (raw: string) => {
    const accepted = acceptPinInput(raw);
    if (accepted == null) return;
    patchDraft({ pinCode: accepted, confirmedLocation: null, selectedLocality: null });
    runPinLookup(accepted);
  };

  const onConfirmPin = () => {
    if (pinUi.status !== "ready_to_confirm" && pinUi.status !== "choices") return;
    const locality =
      pinUi.status === "ready_to_confirm"
        ? pinUi.locality
        : draft?.selectedLocality ?? null;
    if (pinUi.status === "choices" && !locality) {
      setError("Select a locality, then confirm.");
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
    setError(null);
  };

  const onPrimary = async () => {
    if (!user || !draftRef.current) return;
    setError(null);

    if (target === "contacts") {
      returnToReview();
      return;
    }

    if (target === "media") {
      setSaving(true);
      try {
        await saveOnboardingProfileDraftV2(draftRef.current);
        returnToReview();
      } catch (e) {
        setError(userFacingMessage(e));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (target === "location") {
      const current = draftRef.current;
      if (!current.confirmedLocation || current.confirmedLocation.pinCode !== current.pinCode) {
        setError("Confirm your location before continuing.");
        return;
      }
    }

    if (target === "gstin") {
      const g = draftRef.current.gstin.trim();
      if (g) {
        const { state } = evaluateGstinInput(g);
        if (state === "formatInvalid") {
          setError("Enter a valid 15-character GSTIN, or leave blank.");
          return;
        }
        patchDraft({ gstinVerificationState: state });
      } else {
        patchDraft({ gstin: "", gstinVerificationState: "notProvided" });
      }
    }

    if (target === "identity") {
      const d = draftRef.current;
      if (!d.displayName.trim()) {
        setError("Enter your full legal name.");
        return;
      }
      if (
        d.accountKind === "business" &&
        !isIndividualProfessionalPractice(d.constitution) &&
        !d.businessName.trim()
      ) {
        setError("Enter your business / firm / practice name.");
        return;
      }
    }

    if (target === "constitution" && !draftRef.current.constitution.trim()) {
      setError("Select a business / practice type.");
      return;
    }

    setSaving(true);
    try {
      await saveOnboardingProfileDraftV2(draftRef.current);
      returnToReview();
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const onBack = () => {
    if (target === "location" && locationSnapshotRef.current && draftRef.current) {
      const snap = locationSnapshotRef.current;
      void saveOnboardingProfileDraftV2({
        ...draftRef.current,
        pinCode: snap.pinCode,
        confirmedLocation: snap,
        selectedLocality: snap.locality,
      }).finally(() => returnToReview());
      return;
    }
    returnToReview();
  };

  const contactAdapters: ContactChangeAdapters | null = user
    ? {
        startPhone: (phoneE164) => startVerifiedPhoneChange(phoneE164),
        confirmPhone: (challenge, code) =>
          confirmVerifiedPhoneChange(user.uid, challenge, code).then(async (profile) => {
            await applyServerProfile(profile);
            return profile;
          }),
        retryPhoneServerBind: async () => {
          const { retryServerMobileBindForCurrentSession } = await import(
            "@/services/auth/reconcilePendingMobileContactChange"
          );
          const profile = await retryServerMobileBindForCurrentSession(user);
          await applyServerProfile(profile);
          return profile;
        },
        startEmail: (nextEmail) => startVerifiedEmailChange(user.uid, nextEmail),
        resendEmail: (verificationId, nextEmail) =>
          resendVerifiedEmailChange(user.uid, verificationId, nextEmail),
        confirmEmail: (verificationId, code, nextEmail) =>
          confirmVerifiedEmailChange(user.uid, verificationId, code, async (patch) => {
            const merged = { ...patch, businessEmail: nextEmail, normalizedEmail: nextEmail };
            return updateProfile(merged);
          }).then(async (profile) => {
            await applyServerProfile(profile);
            return profile;
          }),
        onAuthoritativePhone: async (profile) => {
          // Ordering: bind success → central auth session → confirm → success UI.
          const reconciled = await applyServerProfile(profile);
          const contacts = reviewContactsFromAuthoritativeProfile(
            reconciled,
            hasAuthoritativeVerifiedEmail(reconciled)
          );
          if (
            !assertContactPropagated({
              expectedPhoneE164: profile.phoneE164,
              centralPhoneE164: contacts.phoneE164,
              centralEmail: contacts.email,
            })
          ) {
            throw new Error("Verified mobile did not propagate to central profile.");
          }
          markReviewingWizardStep("businessIdentity", reconciled.uid, {
            phoneE164: contacts.phoneE164,
            verifiedEmail: contacts.email || null,
          });
          if (__DEV__) {
            console.log("[review-state] contact committed channel=mobile");
          }
        },
        onAuthoritativeEmail: async (profile) => {
          const reconciled = await applyServerProfile(profile);
          const contacts = reviewContactsFromAuthoritativeProfile(reconciled, true);
          if (
            !assertContactPropagated({
              expectedEmail: profile.normalizedEmail ?? profile.businessEmail ?? "",
              centralPhoneE164: contacts.phoneE164,
              centralEmail: contacts.email,
            })
          ) {
            throw new Error("Verified email did not propagate to central profile.");
          }
          markReviewingWizardStep("businessIdentity", reconciled.uid, {
            phoneE164: contacts.phoneE164,
            verifiedEmail: contacts.email || null,
          });
          if (__DEV__) {
            console.log("[review-state] contact committed channel=email");
          }
        },
      }
    : null;

  const onChooseLogo = async () => {
    if (!user) return;
    setError(null);
    setChoosingLogo(true);
    try {
      const picked = await pickIdentityMedia("library");
      const ref = await confirmAndPersistIdentityMedia(user.uid, picked);
      patchDraft({
        profileLogo: ref,
        logoPreviewUri: ref.localUri,
        logoPersisted: true,
      });
    } catch (e) {
      const msg = userFacingMessage(e);
      if (!/cancel/i.test(msg)) setError(msg);
    } finally {
      setChoosingLogo(false);
    }
  };

  const onRemoveLogo = async () => {
    if (!user || !draftRef.current) return;
    setError(null);
    try {
      if (draftRef.current.profileLogo) {
        await removeProfileLogoFile(draftRef.current.profileLogo);
      }
      patchDraft({
        profileLogo: null,
        logoPreviewUri: null,
        logoPersisted: false,
      });
    } catch (e) {
      setError(userFacingMessage(e));
    }
  };

  if (!user || !ready || !draft) return null;

  const email = user.normalizedEmail ?? user.businessEmail ?? "";
  const emailVerified = hasAuthoritativeVerifiedEmail(user);
  const logoUri = draft.logoPreviewUri ?? draft.profileLogo?.localUri ?? null;

  return (
    <ReviewEditShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      subtitle={copy.subtitle}
      primaryCta={copy.primaryCta}
      onPrimary={() => void onPrimary()}
      onBack={onBack}
      primaryLoading={saving}
      error={error}
      testID={`review-edit-save-${target}`}
    >
      {target === "identity" ? (
        <ReviewIdentityEditFields
          displayName={draft.displayName}
          businessName={draft.businessName}
          constitution={draft.constitution}
          onDisplayNameChange={(v) => patchDraft({ displayName: v })}
          onBusinessNameChange={(v) => patchDraft({ businessName: v })}
        />
      ) : null}

      {target === "media" ? (
        <ReviewLogoEditFields
          previewUri={logoUri}
          onChoose={() => void onChooseLogo()}
          onRemove={() => void onRemoveLogo()}
          choosing={choosingLogo}
        />
      ) : null}

      {target === "contacts" && contactAdapters ? (
        <VerifiedContactChangePanel
          phoneE164={user.phoneE164}
          email={email}
          emailVerified={emailVerified}
          phoneChangeAvailable={REVIEW_PHONE_CHANGE_AVAILABLE}
          emailChangeAvailable={REVIEW_EMAIL_CHANGE_AVAILABLE}
          adapters={contactAdapters}
          onPhaseChange={setContactPhase}
        />
      ) : null}

      {target === "gstin" ? (
        <ReviewGstinEditFields
          gstin={draft.gstin}
          gstinState={draft.gstinVerificationState}
          onChange={(raw) => {
            const normalized = normalizeGstin(raw);
            const { state } = evaluateGstinInput(normalized);
            patchDraft({ gstin: normalized, gstinVerificationState: state });
          }}
        />
      ) : null}

      {target === "constitution" ? (
        <ReviewConstitutionEditFields
          value={draft.constitution}
          onChange={(v) => patchDraft({ constitution: v })}
        />
      ) : null}

      {target === "location" ? (
        <View style={styles.form}>
          <OnboardingV2TextField
            navFieldKey="pinCode"
            label="PIN code"
            required
            value={draft.pinCode}
            onChangeText={(v) => onPinChange(v.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
          />
          {pinUi.status === "looking_up" ? (
            <View style={styles.lookup}>
              <ActivityIndicator color={tokens.ctaActiveText} />
              <Text style={[styles.hint, { color: tokens.muted }]}>Looking up…</Text>
            </View>
          ) : null}
          {pinUi.status === "invalid_format" ||
          pinUi.status === "not_found" ||
          pinUi.status === "unavailable" ? (
            <OnboardingInlineMessage
              tone="danger"
              message={
                pinUi.status === "invalid_format"
                  ? "Enter a valid 6-digit PIN."
                  : pinUi.status === "unavailable"
                    ? "Couldn't look up the PIN right now. Try again."
                    : "Couldn't find this PIN. Check and try again."
              }
            />
          ) : null}
          {pinUi.status === "choices" ? (
            <View style={styles.choices}>
              {pinUi.localities.map((loc) => {
                const selected = draft.selectedLocality === loc;
                return (
                  <Pressable
                    key={loc}
                    onPress={() => patchDraft({ selectedLocality: loc })}
                    style={[
                      styles.choice,
                      { backgroundColor: selected ? tokens.ctaActiveBg : tokens.cardBg },
                    ]}
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
              <AuthV2SecondaryButton
                label="Confirm location"
                disabled={!draft.selectedLocality}
                onPress={onConfirmPin}
              />
            </View>
          ) : null}
          {pinUi.status === "ready_to_confirm" ? (
            <>
              <LocationConfirmationCard
                locality={pinUi.locality}
                district={pinUi.district}
                state={pinUi.state}
                confirmed={false}
              />
              <AuthV2SecondaryButton label="Confirm location" onPress={onConfirmPin} />
            </>
          ) : null}
          {pinUi.status === "confirmed" && draft.confirmedLocation ? (
            <LocationConfirmationCard
              locality={draft.confirmedLocation.locality}
              district={draft.confirmedLocation.district}
              state={draft.confirmedLocation.state}
              confirmed
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
  choices: { gap: spacing.sm },
  choice: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
});
