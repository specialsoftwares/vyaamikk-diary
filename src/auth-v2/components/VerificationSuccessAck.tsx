import React, { useEffect } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import {
  AUTH_ACTION_ZONE_ABOVE,
  AUTH_ACTION_ZONE_BELOW,
} from "@/auth-v2/components/authActionZoneLayout";
import {
  ONBOARDING_SUCCESS_ACK_MS,
  ONBOARDING_SUCCESS_ACK_REDUCED_MS,
} from "@/auth-v2/theme/onboardingMotion";
import { typography } from "@/theme";

export type VerificationAckPhase = "verifying" | "success";

interface VerificationSuccessAckProps {
  kind: "mobile" | "email";
  /** verifying = wait for authoritative result; success = check + settle then onDone. */
  phase?: VerificationAckPhase;
  reducedMotion?: boolean;
  onDone: () => void;
  /** Override verifying headline (default: Vyaamikk is verifying…). */
  verifyingLabel?: string;
  /** Optional second line under verifying (e.g. securing new mobile). */
  verifyingDetail?: string;
  /** Override success headline. */
  successLabel?: string;
}

/**
 * Premium verifying overlay. Must stay in `verifying` until backend success.
 * Do not treat this as already-verified until phase === "success".
 */
export function VerificationSuccessAck({
  kind,
  phase = "success",
  reducedMotion = false,
  onDone,
  verifyingLabel,
  verifyingDetail,
  successLabel: successLabelOverride,
}: VerificationSuccessAckProps) {
  const successLabel =
    successLabelOverride ??
    (kind === "mobile" ? "Mobile number verified" : "Email verified");
  const verifyingText = verifyingLabel ?? "Vyaamikk is verifying…";
  const hold = reducedMotion ? ONBOARDING_SUCCESS_ACK_REDUCED_MS : ONBOARDING_SUCCESS_ACK_MS;
  const pulse = useSharedValue(0.35);

  useEffect(() => {
    if (reducedMotion || phase !== "verifying") {
      pulse.value = 0.85;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [phase, pulse, reducedMotion]);

  useEffect(() => {
    if (phase !== "success") return;
    AccessibilityInfo.announceForAccessibility(successLabel);
    const t = setTimeout(onDone, hold);
    return () => clearTimeout(t);
  }, [hold, onDone, phase, successLabel]);

  useEffect(() => {
    if (phase === "verifying") {
      AccessibilityInfo.announceForAccessibility(verifyingText);
    }
  }, [phase, verifyingText]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.92 + pulse.value * 0.08 }],
  }));

  return (
    <View
      style={styles.root}
      accessibilityRole="alert"
      testID={`verification-ack-${kind}-${phase}`}
    >
      <View style={styles.zoneAbove} />
      <View style={styles.cluster}>
        {phase === "verifying" ? (
          <>
            <Animated.View style={[styles.ring, ringStyle]} />
            <Text style={styles.label}>{verifyingText}</Text>
            {verifyingDetail ? (
              <Text style={styles.detail}>{verifyingDetail}</Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.mark}>✓</Text>
            <Text style={styles.label}>{successLabel}</Text>
          </>
        )}
      </View>
      <View style={styles.zoneBelow} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#12152E",
    zIndex: 40,
  },
  zoneAbove: {
    flexGrow: AUTH_ACTION_ZONE_ABOVE,
    flexShrink: 1,
    flexBasis: 0,
  },
  zoneBelow: {
    flexGrow: AUTH_ACTION_ZONE_BELOW,
    flexShrink: 1,
    flexBasis: 0,
  },
  cluster: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 24,
  },
  ring: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: "#A5B4FC",
  },
  mark: {
    color: "#A5B4FC",
    fontSize: 36,
    fontWeight: "700",
  },
  label: {
    ...typography.titleMd,
    color: "#FFFFFF",
    textAlign: "center",
  },
  detail: {
    ...typography.caption,
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
});
