import React from "react";
import { StyleSheet, View } from "react-native";

import {
  AUTH_ACTION_CLUSTER_MAX_WIDTH,
  AUTH_ACTION_CLUSTER_WIDTH,
} from "@/auth-v2/components/authActionZoneLayout";

interface AuthActionZoneProps {
  children: React.ReactNode;
}

/**
 * Compact centered action cluster (consent + CTA / verify feedback).
 * Parent supplies vertical placement via flex spacers.
 */
export function AuthActionZone({ children }: AuthActionZoneProps) {
  return (
    <View style={styles.outer} testID="auth-action-zone">
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: "100%",
    alignItems: "center",
  },
  inner: {
    width: AUTH_ACTION_CLUSTER_WIDTH,
    maxWidth: AUTH_ACTION_CLUSTER_MAX_WIDTH,
    alignItems: "stretch",
    gap: 14,
  },
});
