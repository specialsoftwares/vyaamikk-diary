import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { shouldShowAuthDiagnosticsInUi } from "@/services/auth/authDiagnosticsGate";
import { Banner } from "@/components/ui";
import { spacing, typography } from "@/theme";

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
  diagnostic,
  onCopyDiagnostics,
}: PhoneAuthErrorPanelProps) {
  const showDiag = shouldShowAuthDiagnosticsInUi();
  const publicMessage = message?.trim() || null;
  if (!publicMessage && !(showDiag && diagnostic)) return null;
  const bannerTitle = title?.trim() || "Something went wrong";
  const bannerMessage = [
    publicMessage,
    showDiag && diagnostic ? `Diagnostic: ${diagnostic}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <Banner tone="danger" title={bannerTitle} message={bannerMessage || bannerTitle} />
      {showDiag && diagnostic && onCopyDiagnostics ? (
        <Pressable
          onPress={onCopyDiagnostics}
          accessibilityRole="button"
          accessibilityLabel="Copy diagnostics"
          hitSlop={8}
        >
          <Text style={styles.copy}>Copy diagnostics</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  copy: {
    ...typography.caption,
    color: "#93C5FD",
    textDecorationLine: "underline",
    marginTop: 2,
  },
});
