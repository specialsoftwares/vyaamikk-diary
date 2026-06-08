import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import type { LegalDocumentId } from "@/config/legal";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

interface LegalConsentCheckboxesProps {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  onTermsAcceptedChange: (value: boolean) => void;
  onPrivacyAcceptedChange: (value: boolean) => void;
  /** Auth stack uses light-on-dark styling. */
  variant?: "auth" | "default";
}

export function LegalConsentCheckboxes({
  termsAccepted,
  privacyAccepted,
  onTermsAcceptedChange,
  onPrivacyAcceptedChange,
  variant = "default",
}: LegalConsentCheckboxesProps) {
  const t = useT();
  const router = useRouter();
  const isAuth = variant === "auth";

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: { gap: spacing.sm, marginTop: spacing.md },
      row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
      box: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: isAuth ? "rgba(255,255,255,0.55)" : c.divider,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 2,
      },
      boxChecked: {
        backgroundColor: isAuth ? "#FFFFFF" : c.primary,
        borderColor: isAuth ? "#FFFFFF" : c.primary,
      },
      tick: {
        color: isAuth ? "#12152E" : c.primaryOn,
        fontSize: 12,
        fontWeight: "700",
        lineHeight: 14,
      },
      label: {
        ...typography.caption,
        color: isAuth ? "rgba(255,255,255,0.82)" : c.textMuted,
        flex: 1,
        lineHeight: 20,
      },
      link: {
        ...typography.captionStrong,
        color: isAuth ? "#FFFFFF" : c.primaryDark,
        textDecorationLine: "underline",
      },
    })
  );

  const openDoc = (doc: LegalDocumentId) => {
    router.push({ pathname: "/legal/[doc]", params: { doc } });
  };

  const Row = ({
    checked,
    onToggle,
    children,
  }: {
    checked: boolean;
    onToggle: () => void;
    children: React.ReactNode;
  }) => (
    <Pressable
      style={styles.row}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.box, checked ? styles.boxChecked : null]}>
        {checked ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <Text style={styles.label}>{children}</Text>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <Row checked={termsAccepted} onToggle={() => onTermsAcceptedChange(!termsAccepted)}>
        {t("consent.termsPrefix")}{" "}
        <Text style={styles.link} onPress={() => openDoc("terms")} accessibilityRole="link">
          {t("settings.terms")}
        </Text>
      </Row>
      <Row checked={privacyAccepted} onToggle={() => onPrivacyAcceptedChange(!privacyAccepted)}>
        {t("consent.privacyPrefix")}{" "}
        <Text style={styles.link} onPress={() => openDoc("privacy")} accessibilityRole="link">
          {t("settings.privacy")}
        </Text>
      </Row>
    </View>
  );
}
