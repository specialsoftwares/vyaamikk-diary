import React from "react";
import { StyleSheet, View } from "react-native";

import { Banner } from "@/components/ui";
import { spacing } from "@/theme";

interface PhoneAuthErrorPanelProps {
  /** Phase-specific title (send / verify / post-auth). */
  title?: string | null;
  /** Human-readable failure text only. */
  message?: string | null;
  /** Compact diagnostic — shown only when internal diagnostics are enabled. */
  diagnostic?: string | null;
  onCopyDiagnostics?: () => void;
}

/**
 * Transient Phone Auth failure panel. Parent must scope this to the Phone /
 * Phone OTP surfaces — never reuse the same payload on Email.
 */
export function PhoneAuthErrorPanel({
  title,
  message,
}: PhoneAuthErrorPanelProps) {
  const publicMessage = message?.trim() || null;
  if (!publicMessage) return null;
  const bannerTitle = title?.trim() || "Something went wrong";
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <Banner tone="danger" title={bannerTitle} message={publicMessage} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
});
