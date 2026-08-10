import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import type { LegalDocumentId } from "@/config/legal";
import { AUTH_CONSENT_JOINER } from "@/components/legal/authConsentLine";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

interface LegalConsentCheckboxesProps {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  onTermsAcceptedChange: (value: boolean) => void;
  onPrivacyAcceptedChange: (value: boolean) => void;
  /** Auth stack uses light-on-dark styling. */
  variant?: "auth" | "authCompact" | "default";
  /** Optional override — presentation hosts without the legal route tree. */
  onOpenDocument?: (doc: LegalDocumentId) => void;
}

export function LegalConsentCheckboxes({
  termsAccepted,
  privacyAccepted,
  onTermsAcceptedChange,
  onPrivacyAcceptedChange,
  variant = "default",
  onOpenDocument,
}: LegalConsentCheckboxesProps) {
  const t = useT();
  const router = useRouter();
  const isAuth = variant === "auth" || variant === "authCompact";
  const compact = variant === "authCompact";

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: {
        gap: spacing.sm,
        marginTop: compact ? 0 : spacing.md,
        width: compact ? "120%" : "100%",
        maxWidth: compact ? 420 : undefined,
        alignSelf: compact ? "center" : "stretch",
        alignItems: compact ? "center" : "stretch",
      },
      row: {
        flexDirection: "row",
        alignItems: compact ? "center" : "flex-start",
        gap: compact ? 8 : spacing.sm,
        maxWidth: "100%",
      },
      box: {
        width: compact ? 18 : 20,
        height: compact ? 18 : 20,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: isAuth ? "rgba(255,255,255,0.55)" : c.divider,
        alignItems: "center",
        justifyContent: "center",
        marginTop: compact ? 0 : 2,
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
        flexGrow: compact ? 0 : 1,
        flexShrink: compact ? 0 : 1,
        lineHeight: compact ? 17 : 20,
        fontSize: compact ? 13 : typography.caption.fontSize,
        includeFontPadding: false,
      },
      link: {
        ...typography.captionStrong,
        color: isAuth ? "#FFFFFF" : c.primaryDark,
        textDecorationLine: "underline",
      },
    })
  );

  const openDoc = (doc: LegalDocumentId) => {
    if (onOpenDocument) {
      onOpenDocument(doc);
      return;
    }
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
      style={[styles.row, compact && { minHeight: 44 }]}
      onPress={onToggle}
      hitSlop={compact ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.box, checked ? styles.boxChecked : null]}>
        {checked ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <Text style={styles.label}>{children}</Text>
    </Pressable>
  );

  if (compact) {
    const both = termsAccepted && privacyAccepted;
    return (
      <View style={styles.wrap}>
        <Row
          checked={both}
          onToggle={() => {
            const next = !both;
            onTermsAcceptedChange(next);
            onPrivacyAcceptedChange(next);
          }}
        >
          {t("consent.termsPrefix")}{" "}
          <Text style={styles.link} onPress={() => openDoc("terms")} accessibilityRole="link">
            {t("settings.terms")}
          </Text>
          {AUTH_CONSENT_JOINER}
          <Text style={styles.link} onPress={() => openDoc("privacy")} accessibilityRole="link">
            {t("settings.privacy")}
          </Text>
        </Row>
      </View>
    );
  }

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
