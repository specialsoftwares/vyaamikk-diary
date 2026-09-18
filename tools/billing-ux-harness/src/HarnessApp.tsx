/**
 * Isolated billing presentation host.
 * PREVIEW ONLY — no purchase, restore, trial grant, entitlement, or quota writes.
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BillingUxPreviewLab } from "@/components/billing/BillingUxPreviewLab";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { useI18n } from "@/i18n";
import { spacing, typography } from "@/theme";

export const ISOLATED_PREVIEW_LABEL =
  "Isolated component preview — not full-app or native validation.";

export function HarnessApp() {
  const insets = useSafeAreaInsets();
  const { ready } = useI18n();

  if (!ready) {
    return <View style={styles.fill} />;
  }

  return (
    <View style={styles.fill}>
      <View
        style={[styles.banner, { paddingTop: Math.max(insets.top, 8) }]}
        accessibilityRole="header"
        accessibilityLabel={ISOLATED_PREVIEW_LABEL}
      >
        <LocaleUiText style={styles.bannerText}>{ISOLATED_PREVIEW_LABEL}</LocaleUiText>
      </View>
      <View style={styles.lab}>
        <BillingUxPreviewLab
          onLeave={() => {
            console.log("[billing-ux-harness] leave (no navigation, no writes)");
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#0B0D18" },
  banner: {
    backgroundColor: "rgba(30, 27, 75, 0.96)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  bannerText: {
    ...typography.captionStrong,
    color: "#E0E7FF",
  },
  lab: { flex: 1 },
});
