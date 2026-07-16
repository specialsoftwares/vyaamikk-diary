import React from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PremiumActionButton } from "@/components/ui/PremiumActionButton";
import { isConsentDismissDisabled } from "@/components/location/consentSheetDismissPolicy";
import { useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

export interface LocationFootprintConsentSheetProps {
  visible: boolean;
  busy?: boolean;
  onAllow: () => void;
  onNotNow: () => void;
}

export function LocationFootprintConsentSheet({
  visible,
  busy = false,
  onAllow,
  onNotNow,
}: LocationFootprintConsentSheetProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      backdrop: {
        flex: 1,
        backgroundColor: c.overlay,
        justifyContent: "flex-end",
      },
      sheet: {
        marginHorizontal: spacing.md,
        marginBottom: Math.max(insets.bottom, spacing.md),
        borderRadius: radius.lg,
        backgroundColor: c.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.lg,
        gap: spacing.md,
      },
      title: { ...typography.titleMd, color: c.text },
      body: { ...typography.body, color: c.textMuted, lineHeight: 22 },
      foot: { ...typography.caption, color: c.textSubtle, lineHeight: 18 },
      actions: { gap: spacing.sm, marginTop: spacing.sm },
    })
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onNotNow}>
      <Pressable style={styles.backdrop} onPress={onNotNow}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <LocaleUiText style={styles.title}>{t("locationFootprints.consent.title")}</LocaleUiText>
          <LocaleUiText style={styles.body}>{t("locationFootprints.consent.body")}</LocaleUiText>
          <LocaleUiText style={styles.foot}>{t("locationFootprints.consent.footnote")}</LocaleUiText>
          <View style={styles.actions}>
            <PremiumActionButton
              label={t("locationFootprints.consent.allow")}
              onPress={onAllow}
              loading={busy}
              disabled={busy}
            />
            <PremiumActionButton
              label={t("locationFootprints.consent.notNow")}
              variant="ghost"
              onPress={onNotNow}
              disabled={isConsentDismissDisabled(busy)}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
