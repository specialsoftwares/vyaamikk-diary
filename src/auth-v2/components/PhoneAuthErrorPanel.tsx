import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Banner } from "@/components/ui";
import { spacing, typography } from "@/theme";

interface PhoneAuthErrorPanelProps {
  /** Phase-specific title (send / verify / post-auth). */
  title?: string | null;
  /** Full failure text (friendly + optional detail). */
  message?: string | null;
  /** Compact diagnostic code shown during physical acceptance testing. */
  diagnostic?: string | null;
  onCopyDiagnostics?: () => void;
}

/**
 * Sticky auth failure panel. Parent must not clear this until a successful
 * recovery action or a newer failure replaces it.
 */
export function PhoneAuthErrorPanel({
  title,
  message,
  diagnostic,
  onCopyDiagnostics,
}: PhoneAuthErrorPanelProps) {
  if (!message && !diagnostic) return null;
  const bannerTitle = title?.trim() || "Something went wrong";
  const bannerMessage = [message?.trim(), diagnostic ? `Diagnostic: ${diagnostic}` : null]
    .filter(Boolean)
    .join("\n");
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <Banner tone="danger" title={bannerTitle} message={bannerMessage || bannerTitle} />
      {diagnostic && onCopyDiagnostics ? (
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
