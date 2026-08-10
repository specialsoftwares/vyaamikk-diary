import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { OnboardingV2Shell } from "@/auth-v2/components/OnboardingV2Shell";
import { WizardProgress } from "@/auth-v2/components/WizardProgress";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { Banner } from "@/components/ui";
import { userFacingMessage } from "@/domain/errors";
import { hasAuthoritativeVerifiedEmail } from "@/auth/identityRouteState";
import {
  markContinuingWizardStep,
  markReviewingWizardStep,
} from "@/auth/onboardingGuardPolicy";
import { completeOnboardingProfile } from "@/onboarding/completeOnboardingProfile";
import { gstinUserFacingLabel } from "@/onboarding/gstinVerificationState";
import { loadOnboardingProfileDraftV2 } from "@/onboarding/onboardingProfileDraftV2";
import type { OnboardingProfileDraftV2 } from "@/onboarding/profileIdentityModel";
import { useAuth } from "@/state/auth";
import { spacing, typography } from "@/theme";
import { maskMobile } from "@/utils/phone";
import type { BusinessIdentitySection } from "@/auth-v2/screens/BusinessIdentityScreen";

export function ProfileReviewScreen() {
  const router = useRouter();
  const { tokens } = useAuthV2Theme();
  const { user, updateProfile } = useAuth();
  const [draft, setDraft] = useState<OnboardingProfileDraftV2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const inFlightRef = useRef(false);

  const loadDraft = useCallback(async () => {
    if (!user) return;
    const fromUser =
      user.accountKind === "individual" || user.accountKind === "business"
        ? user.accountKind
        : null;
    if (fromUser) {
      setDraft(await loadOnboardingProfileDraftV2(user.uid, fromUser));
      setReady(true);
      return;
    }
    const business = await loadOnboardingProfileDraftV2(user.uid, "business");
    const individual = await loadOnboardingProfileDraftV2(user.uid, "individual");
    const preferBusiness =
      business.displayName.trim() ||
      business.businessName.trim() ||
      business.updatedAt >= individual.updatedAt;
    setDraft(preferBusiness ? business : individual);
    setReady(true);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        router.replace("/");
        return;
      }
      await loadDraft();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router, loadDraft]);

  if (!user || !ready || !draft) {
    return null;
  }

  const goEdit = (section: BusinessIdentitySection) => {
    markReviewingWizardStep("businessIdentity", user.uid, {
      phoneE164: user.phoneE164,
      verifiedEmail: user.normalizedEmail ?? user.businessEmail,
    });
    router.replace({
      pathname: "/(auth)/complete-profile",
      params: { section, intent: "review" },
    });
  };

  const goBack = () => {
    markReviewingWizardStep("businessIdentity", user.uid, {
      phoneE164: user.phoneE164,
      verifiedEmail: user.normalizedEmail ?? user.businessEmail,
    });
    router.replace({
      pathname: "/(auth)/complete-profile",
      params: { intent: "review" },
    });
  };

  const onComplete = async () => {
    if (inFlightRef.current || submitting) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await completeOnboardingProfile({
        user,
        draft,
        updateProfile,
      });
      markContinuingWizardStep("ueidRelease", user.uid, {
        phoneE164: user.phoneE164,
        verifiedEmail: user.normalizedEmail ?? user.businessEmail,
      });
      router.replace("/(auth)/ueid");
    } catch (e) {
      // Keep draft; stay on review. Retry only re-submits.
      setError(userFacingMessage(e));
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const email = user.normalizedEmail ?? user.businessEmail ?? "";
  const previewUri = draft.logoPreviewUri ?? draft.profileLogo?.localUri ?? null;
  const loc = draft.confirmedLocation;

  return (
    <OnboardingV2Shell
      stageLabel="Review profile"
      title="Review your profile"
      subtitle="Confirm the identity details that will appear on your documents."
      onBack={goBack}
      headerTop={
        <WizardProgress
          step="profileReview"
          tone="dark"
          verifiedMobile
          verifiedEmail={hasAuthoritativeVerifiedEmail(user)}
        />
      }
      footer={
        <>
          {error ? <Banner tone="danger" message={error} /> : null}
          <AuthV2PrimaryButton
            label={error ? "Retry" : "Complete Profile"}
            loading={submitting}
            loadingLabel="Saving…"
            disabled={submitting}
            onPress={() => void onComplete()}
            testID="profile-review-complete"
            activeBg={tokens.ctaActiveBg}
            activeText={tokens.ctaActiveText}
            mutedBg={tokens.ctaMutedBg}
            mutedText={tokens.ctaMutedText}
            mutedBorder={tokens.ctaMutedBorder}
          />
          <Text style={[styles.note, { color: tokens.muted }]}>
            Mobile {maskMobile(user.phoneE164)} stays linked to this account.
          </Text>
        </>
      }
    >
      <ReviewSection
        title="Identity"
        onEdit={() => goEdit("identity")}
        tokens={tokens}
      >
        <Row label="Type" value={draft.accountKind === "business" ? "Business" : "Individual"} />
        {draft.accountKind === "business" ? (
          <>
            <Row label="Legal business name" value={draft.businessName.trim() || "—"} />
            <Row label="Account owner" value={draft.displayName.trim() || "—"} />
          </>
        ) : (
          <Row label="Full legal name" value={draft.displayName.trim() || "—"} />
        )}
      </ReviewSection>

      <ReviewSection
        title={draft.accountKind === "business" ? "Business logo" : "Profile image"}
        onEdit={() => goEdit("media")}
        tokens={tokens}
      >
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
              <Text style={[styles.muted, { color: tokens.muted }]}>Missing</Text>
            )}
          </View>
          <Text style={[styles.value, { color: tokens.body }]}>
            {draft.logoPersisted ? "Saved on device" : "Not saved"}
          </Text>
        </View>
      </ReviewSection>

      <ReviewSection
        title="Contacts"
        onEdit={() => goEdit("contacts")}
        tokens={tokens}
      >
        <Row label="Mobile" value={maskMobile(user.phoneE164)} />
        <Row label="Email" value={email || "—"} />
        <Text style={[styles.muted, { color: tokens.muted }]}>
          {hasAuthoritativeVerifiedEmail(user) ? "Email verified" : "Email not verified"}
        </Text>
      </ReviewSection>

      <ReviewSection
        title="PIN / location"
        onEdit={() => goEdit("location")}
        tokens={tokens}
      >
        <Row label="PIN" value={draft.pinCode || "—"} />
        {loc ? (
          <>
            <Row label="Locality" value={loc.locality || "—"} />
            <Row label="District" value={loc.district} />
            <Row label="State" value={loc.state} />
          </>
        ) : (
          <Text style={[styles.muted, { color: tokens.danger }]}>Location not confirmed</Text>
        )}
      </ReviewSection>

      {draft.gstin.trim() ? (
        <ReviewSection title="GSTIN" onEdit={() => goEdit("gstin")} tokens={tokens}>
          <Row label="GSTIN" value={draft.gstin.trim()} />
          <Row label="Status" value={gstinUserFacingLabel(draft.gstinVerificationState)} />
        </ReviewSection>
      ) : null}

      {draft.constitution.trim() ? (
        <ReviewSection
          title="Constitution"
          onEdit={() => goEdit("constitution")}
          tokens={tokens}
        >
          <Row label="Constitution" value={draft.constitution.trim()} />
        </ReviewSection>
      ) : null}
    </OnboardingV2Shell>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
  tokens,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
  tokens: ReturnType<typeof useAuthV2Theme>["tokens"];
}) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tokens.cardBg, borderColor: tokens.cardBorder },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: tokens.heading }]}>{title}</Text>
        <Pressable onPress={onEdit} accessibilityRole="button" hitSlop={8}>
          <Text style={[styles.edit, { color: tokens.link }]}>Edit</Text>
        </Pressable>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { tokens } = useAuthV2Theme();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: tokens.muted }]}>{label}</Text>
      <Text style={[styles.value, { color: tokens.body }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { ...typography.bodyStrong },
  edit: { ...typography.captionStrong },
  cardBody: { gap: spacing.xs },
  row: { gap: 2 },
  label: { ...typography.micro, letterSpacing: 0.4, textTransform: "uppercase" },
  value: { ...typography.body, fontSize: 16 },
  muted: { ...typography.caption },
  mediaRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  mediaPreview: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mediaImage: { width: "100%", height: "100%" },
  note: { ...typography.caption, textAlign: "center", lineHeight: 18 },
});
