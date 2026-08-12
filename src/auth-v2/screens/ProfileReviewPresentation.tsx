import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { logStage2ActionSystemProvenance } from "@/actionSystem/stage2RuntimeProvenance";
import { AuthCardActionAffordance } from "@/auth-v2/components/AuthCardActionAffordance";
import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { OnboardingV2Shell } from "@/auth-v2/components/OnboardingV2Shell";
import { WizardProgress } from "@/auth-v2/components/WizardProgress";
import { WorkspaceReadyAck } from "@/auth-v2/components/WorkspaceReadyAck";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { REVIEW_SECTION_ACTION_LABELS, REVIEW_SECTION_TITLES } from "@/auth-v2/reviewEditCopy";
import type { WorkspacePersistStatus } from "@/auth-v2/workspaceCompletionMachine";
import { Banner } from "@/components/ui";
import { userFacingMessage } from "@/domain/errors";
import { gstinUserFacingLabel } from "@/onboarding/gstinVerificationState";
import type { GstinVerificationState } from "@/onboarding/profileIdentityModel";
import { spacing, typography } from "@/theme";
import { maskMobile } from "@/utils/phone";

/** Outer Review surface phase — workspace overlay owns preparing/ready paint gates. */
export type ProfileReviewPresentationPhase = "review" | "workspace";

export type ProfileReviewEditSection =
  | "identity"
  | "media"
  | "contacts"
  | "location"
  | "gstin"
  | "constitution";

export interface ProfileReviewPresentationModel {
  accountKind: "business" | "individual";
  displayName: string;
  businessName: string;
  constitution: string;
  gstin: string;
  gstinVerificationState: GstinVerificationState;
  pinCode: string;
  confirmedLocation: {
    locality: string | null;
    district: string;
    state: string;
  } | null;
  logoPreviewUri: string | null;
  logoPersisted: boolean;
  phoneE164: string;
  email: string;
  emailVerified: boolean;
}

export interface ProfileReviewPresentationProps {
  model: ProfileReviewPresentationModel;
  /**
   * Side-effect adapter:
   * - production → completeOnboardingProfile(...)
   * - preview → local deterministic simulate (no Firebase/Firestore)
   */
  onConfirmPersist: () => Promise<void>;
  onSuccessNavigate: () => void;
  onBack?: () => void;
  onEdit?: (section: ProfileReviewEditSection) => void;
}

/**
 * Shared Review + Workspace Ready presentation.
 * Persistence / navigation side effects are injected by the caller.
 */
export function ProfileReviewPresentation({
  model,
  onConfirmPersist,
  onSuccessNavigate,
  onBack,
  onEdit,
}: ProfileReviewPresentationProps) {
  const { tokens } = useAuthV2Theme();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<ProfileReviewPresentationPhase>("review");
  const [persistStatus, setPersistStatus] = useState<WorkspacePersistStatus>("idle");
  const [reducedMotion, setReducedMotion] = useState(false);
  const inFlightRef = useRef(false);
  const navigatedRef = useRef(false);
  const onSuccessNavigateRef = useRef(onSuccessNavigate);
  onSuccessNavigateRef.current = onSuccessNavigate;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(setReducedMotion)
      .catch(() => setReducedMotion(false));
  }, []);

  // Stable identity — WorkspaceReadyAck owns paint-gated You navigation.
  const navigateOnce = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    if (__DEV__) {
      console.log("[workspace-ready] You navigation fired", { t: Date.now() });
    }
    onSuccessNavigateRef.current();
  }, []);

  const onComplete = async () => {
    if (inFlightRef.current || submitting || phase !== "review") return;
    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    setPersistStatus("pending");
    // Show workspace surface immediately — Ack must paint preparing before ready/You.
    setPhase("workspace");
    if (__DEV__) {
      console.log("[workspace-ready] Confirm press → committing", { t: Date.now() });
    }
    try {
      if (__DEV__) {
        console.log("[workspace-ready] onConfirmPersist start", { t: Date.now() });
      }
      await onConfirmPersist();
      if (__DEV__) {
        console.log("[workspace-ready] onConfirmPersist resolved", { t: Date.now() });
      }
      setPersistStatus("succeeded");
    } catch (e) {
      setPersistStatus("failed");
      setPhase("review");
      setError(userFacingMessage(e));
      if (__DEV__) {
        console.log("[workspace-ready] onConfirmPersist failed", { t: Date.now() });
      }
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const editable = phase === "review";
  const loc = model.confirmedLocation;

  useEffect(() => {
    if (editable) {
      logStage2ActionSystemProvenance("ProfileReviewPresentation");
    }
  }, [editable]);

  useEffect(() => {
    if (!__DEV__) return;
    console.log("[review-state] Review rendered", {
      phoneLen: model.phoneE164.length,
      emailLen: model.email.trim().length,
    });
  }, [model.phoneE164, model.email]);

  return (
    <View style={styles.root}>
      <OnboardingV2Shell
        stageLabel="Review"
        title="Review your details"
        subtitle="Confirm the identity details that will appear on your documents."
        onBack={editable && onBack ? onBack : undefined}
        headerTop={
          <WizardProgress
            step="profileReview"
            tone="dark"
            verifiedMobile
            verifiedEmail={model.emailVerified}
          />
        }
        footer={
          phase === "review" ? (
            <>
              {error ? <Banner tone="danger" message={error} /> : null}
              <AuthV2PrimaryButton
                label={error ? "Retry" : "Confirm & continue"}
                loading={submitting}
                loadingLabel={error ? "Retrying…" : "Confirming…"}
                disabled={submitting}
                onPress={() => void onComplete()}
                testID="profile-review-complete"
                purpose={error ? "retry" : "advance"}
                activeBg={tokens.ctaActiveBg}
                activeText={tokens.ctaActiveText}
                mutedBg={tokens.ctaMutedBg}
                mutedText={tokens.ctaMutedText}
                mutedBorder={tokens.ctaMutedBorder}
              />
              <Text style={[styles.note, { color: tokens.muted }]}>
                Changing your verified mobile number or email requires verification again.
              </Text>
            </>
          ) : null
        }
      >
        <ReviewSection
          title={REVIEW_SECTION_TITLES.identity}
          actionLabel={REVIEW_SECTION_ACTION_LABELS.identity.action}
          accessibilityLabel={REVIEW_SECTION_ACTION_LABELS.identity.accessibilityLabel}
          onEdit={() => onEdit?.("identity")}
          tokens={tokens}
          editable={editable && Boolean(onEdit)}
        >
          <Row label="Type" value={model.accountKind === "business" ? "Business" : "Individual"} />
          {model.accountKind === "business" ? (
            <>
              <Row label="Legal business name" value={model.businessName.trim() || "Not added"} />
              <Row label="Account owner" value={model.displayName.trim() || "Not added"} />
            </>
          ) : (
            <Row label="Full legal name" value={model.displayName.trim() || "Not added"} />
          )}
        </ReviewSection>

        <ReviewSection
          title={REVIEW_SECTION_TITLES.media}
          actionLabel={REVIEW_SECTION_ACTION_LABELS.media.action}
          accessibilityLabel={REVIEW_SECTION_ACTION_LABELS.media.accessibilityLabel}
          onEdit={() => onEdit?.("media")}
          tokens={tokens}
          editable={editable && Boolean(onEdit)}
        >
          <View style={styles.mediaRow}>
            <View
              style={[
                styles.mediaPreview,
                { backgroundColor: tokens.cardBg, borderColor: tokens.cardBorder },
              ]}
            >
              {model.logoPreviewUri ? (
                <Image source={{ uri: model.logoPreviewUri }} style={styles.mediaImage} />
              ) : (
                <Text style={[styles.muted, { color: tokens.muted }]}>No logo added</Text>
              )}
            </View>
            <Text style={[styles.value, { color: tokens.body }]}>
              {model.logoPreviewUri
                ? model.logoPersisted
                  ? "Saved on device"
                  : "Ready"
                : "Optional"}
            </Text>
          </View>
        </ReviewSection>

        <ReviewSection
          title={REVIEW_SECTION_TITLES.contacts}
          actionLabel={REVIEW_SECTION_ACTION_LABELS.contacts.action}
          accessibilityLabel={REVIEW_SECTION_ACTION_LABELS.contacts.accessibilityLabel}
          onEdit={() => onEdit?.("contacts")}
          tokens={tokens}
          editable={editable && Boolean(onEdit)}
        >
          <Row label="Mobile" value={maskMobile(model.phoneE164)} />
          <Text style={[styles.verified, { color: tokens.secondaryActiveFg }]}>Verified</Text>
          <Row label="Email" value={model.email.trim() || "Not added"} />
          <Text
            style={[
              styles.verified,
              {
                color:
                  model.emailVerified && model.email.trim()
                    ? tokens.secondaryActiveFg
                    : tokens.muted,
              },
            ]}
          >
            {model.emailVerified && model.email.trim() ? "Verified" : "Not added"}
          </Text>
        </ReviewSection>

        <ReviewSection
          title={REVIEW_SECTION_TITLES.location}
          actionLabel={REVIEW_SECTION_ACTION_LABELS.location.action}
          accessibilityLabel={REVIEW_SECTION_ACTION_LABELS.location.accessibilityLabel}
          onEdit={() => onEdit?.("location")}
          tokens={tokens}
          editable={editable && Boolean(onEdit)}
        >
          <Row label="PIN" value={model.pinCode || "Not added"} />
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

        <ReviewSection
          title={REVIEW_SECTION_TITLES.gstin}
          actionLabel={REVIEW_SECTION_ACTION_LABELS.gstin.action}
          accessibilityLabel={REVIEW_SECTION_ACTION_LABELS.gstin.accessibilityLabel}
          onEdit={() => onEdit?.("gstin")}
          tokens={tokens}
          editable={editable && Boolean(onEdit)}
        >
          {model.gstin.trim() ? (
            <>
              <Row label="GSTIN" value={model.gstin.trim()} />
              <Row label="Status" value={gstinUserFacingLabel(model.gstinVerificationState)} />
            </>
          ) : (
            <Text style={[styles.muted, { color: tokens.muted }]}>Not added · Optional</Text>
          )}
        </ReviewSection>

        <ReviewSection
          title={REVIEW_SECTION_TITLES.constitution}
          actionLabel={REVIEW_SECTION_ACTION_LABELS.constitution.action}
          accessibilityLabel={REVIEW_SECTION_ACTION_LABELS.constitution.accessibilityLabel}
          onEdit={() => onEdit?.("constitution")}
          tokens={tokens}
          editable={editable && Boolean(onEdit)}
        >
          {model.constitution.trim() ? (
            <Row label="Type" value={model.constitution.trim()} />
          ) : (
            <Text style={[styles.muted, { color: tokens.muted }]}>Not added</Text>
          )}
        </ReviewSection>
      </OnboardingV2Shell>

      {phase === "workspace" ? (
        <WorkspaceReadyAck
          persistStatus={persistStatus === "idle" ? "pending" : persistStatus}
          reducedMotion={reducedMotion}
          onDone={navigateOnce}
        />
      ) : null}
    </View>
  );
}

function ReviewSection({
  title,
  actionLabel = "Edit",
  accessibilityLabel,
  onEdit,
  children,
  tokens,
  editable = true,
}: {
  title: string;
  actionLabel?: string;
  accessibilityLabel?: string;
  onEdit: () => void;
  children: React.ReactNode;
  tokens: ReturnType<typeof useAuthV2Theme>["tokens"];
  editable?: boolean;
}) {
  return (
    <AuthCardActionAffordance
      actionLabel={actionLabel}
      accessibilityLabel={accessibilityLabel ?? actionLabel}
      onAction={onEdit}
      editable={editable}
      purpose="modify"
      chipTestID={`review-section-action-${title}`}
      leading={
        <Text style={[styles.cardTitle, { color: tokens.heading }]}>{title}</Text>
      }
      cardStyle={[
        styles.card,
        { backgroundColor: tokens.cardBg, borderColor: tokens.cardBorder },
      ]}
    >
      <View style={styles.cardBody}>{children}</View>
    </AuthCardActionAffordance>
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
  root: { flex: 1, position: "relative" },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { ...typography.bodyStrong },
  cardBody: { gap: spacing.xs, marginTop: spacing.sm },
  row: { gap: 2 },
  label: { ...typography.micro, letterSpacing: 0.4, textTransform: "uppercase" },
  value: { ...typography.body, fontSize: 16 },
  muted: { ...typography.caption },
  verified: { ...typography.captionStrong, marginBottom: spacing.xs },
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
