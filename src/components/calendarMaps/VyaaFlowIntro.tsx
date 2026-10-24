import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { LocaleUiText } from "@/components/ui";
import { useVyaaflowCopy } from "@/content/vyaaflow/useVyaaflowCopy";
import { spacing, typography, useThemedStyles } from "@/theme";

interface VyaaFlowIntroProps {
  onOpenStatutoryReference: () => void;
}

/** Compact supporting note and the statutory reference library entry. */
export function VyaaFlowIntro({ onOpenStatutoryReference }: VyaaFlowIntroProps) {
  const copy = useVyaaflowCopy();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: { marginTop: spacing.sm, gap: spacing.md },
      paragraph: {
        fontFamily: typography.caption.fontFamily,
        fontSize: typography.caption.fontSize,
        fontWeight: typography.caption.fontWeight,
        color: c.textMuted,
        lineHeight: 20,
      },
      reference: {
        minHeight: 44,
        paddingVertical: spacing.sm,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: c.divider,
      },
      referenceCopy: { flex: 1, gap: 2 },
      referenceTitle: {
        fontFamily: typography.bodyStrong.fontFamily,
        fontSize: typography.bodyStrong.fontSize,
        fontWeight: typography.bodyStrong.fontWeight,
        color: c.primary,
      },
      referenceSubtitle: {
        fontFamily: typography.caption.fontFamily,
        fontSize: typography.caption.fontSize,
        fontWeight: typography.caption.fontWeight,
        color: c.textMuted,
      },
      chevron: {
        fontFamily: typography.titleSm.fontFamily,
        fontSize: typography.titleSm.fontSize,
        fontWeight: typography.titleSm.fontWeight,
        color: c.textSubtle,
      },
    })
  );

  return (
    <View style={styles.wrap}>
      <LocaleUiText style={styles.paragraph}>{copy.disclaimer}</LocaleUiText>
      <Pressable
        onPress={onOpenStatutoryReference}
        accessibilityRole="button"
        accessibilityLabel={copy.statutoryReferenceTitle}
        style={styles.reference}
      >
        <View style={styles.referenceCopy}>
          <LocaleUiText style={styles.referenceTitle}>
            {copy.statutoryReferenceTitle}
          </LocaleUiText>
          <LocaleUiText style={styles.referenceSubtitle}>
            {copy.statutoryReferenceSubtitle}
          </LocaleUiText>
        </View>
        <LocaleUiText style={styles.chevron}>›</LocaleUiText>
      </Pressable>
    </View>
  );
}
