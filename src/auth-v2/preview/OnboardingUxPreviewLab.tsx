import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { LocationConfirmationCard } from "@/auth-v2/components/LocationConfirmationCard";
import { OnboardingOtpCells } from "@/auth-v2/components/OnboardingOtpCells";
import { VerificationSuccessAck } from "@/auth-v2/components/VerificationSuccessAck";
import { WizardProgress } from "@/auth-v2/components/WizardProgress";
import { isOnboardingUxPreviewEnabled } from "@/auth-v2/preview/onboardingPreviewGate";
import { spacing, typography } from "@/theme";

type PreviewId =
  | "phone"
  | "phoneOtp"
  | "mobileAck"
  | "email"
  | "emailOtp"
  | "emailAck"
  | "identity"
  | "location"
  | "pinLoading"
  | "pinResolved"
  | "pinError";

/**
 * Presentation fixtures only. Never starts OTP, Auth, or Firestore writes.
 */
export function OnboardingUxPreviewLab() {
  const [id, setId] = useState<PreviewId>("phone");
  if (!isOnboardingUxPreviewEnabled()) return null;

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text style={styles.h}>Onboarding UX preview (dev only)</Text>
      <View style={styles.row}>
        {(
          [
            "phone",
            "phoneOtp",
            "mobileAck",
            "email",
            "emailOtp",
            "emailAck",
            "identity",
            "location",
            "pinLoading",
            "pinResolved",
            "pinError",
          ] as PreviewId[]
        ).map((key) => (
          <Pressable key={key} onPress={() => setId(key)} style={styles.chip}>
            <Text style={styles.chipText}>{key}</Text>
          </Pressable>
        ))}
      </View>

      {id === "identity" || id === "location" ? (
        <WizardProgress
          step="businessIdentity"
          identityPhase={id === "location" ? "location" : "details"}
        />
      ) : null}

      {id === "phoneOtp" || id === "emailOtp" ? (
        <OnboardingOtpCells value="12345" length={6} onChange={() => undefined} />
      ) : null}

      {id === "mobileAck" ? (
        <VerificationSuccessAck kind="mobile" phase="success" onDone={() => undefined} />
      ) : null}
      {id === "emailAck" ? (
        <VerificationSuccessAck kind="email" phase="verifying" onDone={() => undefined} />
      ) : null}

      {id === "pinResolved" ? (
        <LocationConfirmationCard
          locality="Crossing Republik"
          district="Ghaziabad"
          state="Uttar Pradesh"
          confirmed
        />
      ) : null}
      {id === "pinLoading" ? <Text style={styles.body}>Looking up…</Text> : null}
      {id === "pinError" ? (
        <Text style={styles.body}>Could not look up the PIN right now. Try again.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, gap: spacing.md, backgroundColor: "#12152E", flexGrow: 1 },
  h: { ...typography.titleMd, color: "#FFFFFF" },
  body: { ...typography.body, color: "rgba(255,255,255,0.8)" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipText: { ...typography.caption, color: "#E0E7FF" },
});
