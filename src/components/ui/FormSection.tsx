import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { PremiumCard } from "@/components/ui/PremiumCard";
import { spacing, useThemedStyles } from "@/theme";
import { formSectionTitleStyle } from "@/theme/formLayer";

interface FormSectionProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** When false, renders a flat group (no card shell) — use inside an outer form card. */
  card?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Indigo-styled form section — groups fields under an executive label.
 * Keeps inputs on readable light surfaces.
 */
export function FormSection({
  title,
  subtitle,
  children,
  card = true,
  style,
}: FormSectionProps) {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      inner: { gap: spacing.lg + 2 },
      titleBlock: { gap: spacing.xs },
      title: formSectionTitleStyle(c),
      subtitle: {
        ...formSectionTitleStyle(c),
        textTransform: "none",
        letterSpacing: 0,
      },
    })
  );

  const content = (
    <View style={[styles.inner, style]}>
      {title || subtitle ? (
        <View style={styles.titleBlock}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );

  if (!card) return content;
  return (
    <PremiumCard elevated={false} padded>
      {content}
    </PremiumCard>
  );
}
