import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { LocaleUiText } from "@/components/ui";
import { useVyaaflowCopy } from "@/content/vyaaflow/useVyaaflowCopy";
import { spacing, typography, useThemedStyles } from "@/theme";

/** Concise intro lives on the page header. This control opens the approved detail. */
export function VyaaFlowIntro() {
  const copy = useVyaaflowCopy();
  const paragraphs = [
    copy.paragraphs.businessDates,
    copy.paragraphs.statutory,
    copy.paragraphs.businessPins,
  ];
  const [open, setOpen] = useState(false);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      toggle: {
        alignSelf: "flex-start",
        minHeight: 44,
        justifyContent: "center",
        marginTop: spacing.sm,
      },
      toggleText: {
        fontFamily: typography.bodyStrong.fontFamily,
        fontSize: typography.bodyStrong.fontSize,
        fontWeight: typography.bodyStrong.fontWeight,
        color: c.primary,
      },
      details: { marginTop: spacing.sm, gap: spacing.md },
      paragraph: {
        fontFamily: typography.body.fontFamily,
        fontSize: typography.body.fontSize,
        fontWeight: typography.body.fontWeight,
        color: c.textMuted,
      },
    })
  );

  return (
    <View>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.toggle}
      >
        <LocaleUiText style={styles.toggleText}>
          {open ? copy.hideDetails : copy.showDetails}
        </LocaleUiText>
      </Pressable>
      {open ? (
        <View style={styles.details}>
          {paragraphs.map((paragraph) => (
            <LocaleUiText key={paragraph} style={styles.paragraph}>
              {paragraph}
            </LocaleUiText>
          ))}
        </View>
      ) : null}
    </View>
  );
}
