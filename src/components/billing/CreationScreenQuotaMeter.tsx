/**
 * Drop-in free-lifetime meter for every supported creation screen.
 * Hides on the same signed-in session’s confirmed paid activation.
 * Unreadable plan → checking (never Free / 0/15).
 */

import React from "react";
import { StyleSheet } from "react-native";
import { useRouter } from "expo-router";

import { LifetimeQuotaMeterBanner } from "@/components/billing/LifetimeQuotaMeterBanner";
import { useLifetimeQuotaMeter } from "@/subscription/useLifetimeQuotaMeter";
import { spacing } from "@/theme";

export function CreationScreenQuotaMeter(): React.ReactElement | null {
  const router = useRouter();
  const { view, refresh } = useLifetimeQuotaMeter();
  if (!view) return null;
  return (
    <LifetimeQuotaMeterBanner
      view={view}
      style={styles.banner}
      onPressUpgrade={() => router.push("/(app)/settings/subscription")}
      onRetry={() => {
        void refresh();
      }}
    />
  );
}

const styles = StyleSheet.create({
  banner: { marginBottom: spacing.sm },
});
