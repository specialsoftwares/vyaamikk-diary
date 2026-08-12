import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFonts, Barlow_300Light } from "@expo-google-fonts/barlow";
import { BarlowCondensed_700Bold } from "@expo-google-fonts/barlow-condensed";

import {
  BOOT_BRAND_MIN_MS,
  BOOT_REDUCED_MOTION_MS,
  BRAND_SURFACE,
  canReleaseBootToApp,
} from "@/config/brandMotion";
import {
  useBootReducedMotion,
  VyaamikkBootAnimation,
} from "@/components/boot/VyaamikkBootAnimation";

/** Max wait on final brand frame after animation completes (dev-safe guard). */
const BOOT_HOLD_TIMEOUT_MS = 12_000;

/** Delay before showing calm hold copy while boot finishes. */
const BOOT_HOLD_MESSAGE_DELAY_MS = 4_000;

interface BootAnimationGateProps {
  visible: boolean;
  bootReady: boolean;
  routeResolved: boolean;
  bootError: boolean;
  onBlackMidpoint: () => void;
  onExitComplete: () => void;
  onHoldTimeout: () => void;
}

/**
 * Coordinates boot presentation with boot readiness.
 * Entry gate: brandMinElapsed && bootReady && routeResolved && !bootError
 * (does not force a ready user to wait the full choreography).
 */
export function BootAnimationGate({
  visible,
  bootReady,
  routeResolved,
  bootError,
  onBlackMidpoint,
  onExitComplete,
  onHoldTimeout,
}: BootAnimationGateProps) {
  const reducedMotion = useBootReducedMotion();
  const [fontsLoaded] = useFonts({
    Barlow_300Light,
    BarlowCondensed_700Bold,
  });
  const [brandMinElapsed, setBrandMinElapsed] = useState(false);
  const [showHoldMessage, setShowHoldMessage] = useState(false);

  const canEnterApp = canReleaseBootToApp({
    brandMinElapsed,
    bootReady,
    routeResolved,
    bootError,
  });

  useEffect(() => {
    if (!visible) {
      setBrandMinElapsed(false);
      setShowHoldMessage(false);
      return;
    }
    const minMs = reducedMotion ? BOOT_REDUCED_MOTION_MS : BOOT_BRAND_MIN_MS;
    const timer = setTimeout(() => setBrandMinElapsed(true), minMs);
    return () => clearTimeout(timer);
  }, [visible, reducedMotion]);

  useEffect(() => {
    if (bootError && visible) {
      onHoldTimeout();
    }
  }, [bootError, onHoldTimeout, visible]);

  useEffect(() => {
    if (!brandMinElapsed || canEnterApp) {
      setShowHoldMessage(false);
      return;
    }
    const timer = setTimeout(() => setShowHoldMessage(true), BOOT_HOLD_MESSAGE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [brandMinElapsed, canEnterApp]);

  useEffect(() => {
    if (!brandMinElapsed || canEnterApp) return;
    const timer = setTimeout(() => onHoldTimeout(), BOOT_HOLD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [brandMinElapsed, canEnterApp, onHoldTimeout]);

  if (!visible) return null;

  if (!fontsLoaded) {
    return <View style={styles.fontHold} />;
  }

  return (
    <VyaamikkBootAnimation
      releaseToApp={canEnterApp}
      showHoldMessage={showHoldMessage}
      reducedMotion={reducedMotion}
      onAnimationDone={() => undefined}
      onBlackMidpoint={onBlackMidpoint}
      onExitComplete={onExitComplete}
    />
  );
}

const styles = StyleSheet.create({
  fontHold: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND_SURFACE,
  },
});
