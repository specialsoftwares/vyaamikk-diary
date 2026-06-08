import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFonts, Barlow_300Light } from "@expo-google-fonts/barlow";
import { BarlowCondensed_700Bold } from "@expo-google-fonts/barlow-condensed";

import { BRAND_SURFACE } from "@/config/brandMotion";
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
 * Entry gate: animationDone && bootReady && routeResolved && !bootError
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
  const [animationDone, setAnimationDone] = useState(false);
  const [showHoldMessage, setShowHoldMessage] = useState(false);

  const canEnterApp =
    animationDone && bootReady && routeResolved && !bootError;

  useEffect(() => {
    if (!visible) {
      setAnimationDone(false);
      setShowHoldMessage(false);
    }
  }, [visible]);

  useEffect(() => {
    if (bootError && visible) {
      onHoldTimeout();
    }
  }, [bootError, onHoldTimeout, visible]);

  useEffect(() => {
    if (!animationDone || canEnterApp) {
      setShowHoldMessage(false);
      return;
    }
    const timer = setTimeout(() => setShowHoldMessage(true), BOOT_HOLD_MESSAGE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [animationDone, canEnterApp]);

  useEffect(() => {
    if (!animationDone || canEnterApp) return;
    const timer = setTimeout(() => onHoldTimeout(), BOOT_HOLD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [animationDone, canEnterApp, onHoldTimeout]);

  if (!visible) return null;

  if (!fontsLoaded) {
    return <View style={styles.fontHold} />;
  }

  return (
    <VyaamikkBootAnimation
      releaseToApp={canEnterApp}
      showHoldMessage={showHoldMessage}
      reducedMotion={reducedMotion}
      onAnimationDone={() => setAnimationDone(true)}
      onBlackMidpoint={onBlackMidpoint}
      onExitComplete={onExitComplete}
    />
  );
}

const styles = StyleSheet.create({
  fontHold: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND_SURFACE,
    zIndex: 100,
  },
});
