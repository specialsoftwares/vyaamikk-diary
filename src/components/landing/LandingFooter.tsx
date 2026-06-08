import React from "react";
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";

import { LANDING_FOOTER } from "@/components/landing/landingCopy";
import { LANDING_COLORS, LANDING_LAYOUT, landingTypography } from "@/components/landing/landingTokens";
import type { LandingSectionKey } from "@/components/landing/LandingNavBar";
import { DESIGNED_BY_LINE, PUBLIC_BRAND } from "@/config/brand";
import { legal } from "@/config/legal";
import { openSafeExternalUrl } from "@/utils/safeUrl";
import { spacing } from "@/theme";

interface LandingFooterProps {
  onNavigateSection: (key: LandingSectionKey) => void;
}

export function LandingFooter({ onNavigateSection }: LandingFooterProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= LANDING_LAYOUT.breakpointTablet;

  const openDoc = (doc: "privacy" | "terms") => {
    router.push({ pathname: "/legal/[doc]", params: { doc } });
  };

  const openDeletion = () => {
    void openSafeExternalUrl(legal.accountDeletionUrl);
  };

  const mailSupport = () => {
    void Linking.openURL(`mailto:${legal.supportEmail}`);
  };

  const mailGrievance = () => {
    void Linking.openURL(`mailto:${legal.grievanceOfficer.email}`);
  };

  const column = (title: string, children: React.ReactNode) => (
    <View style={[styles.column, isWide ? styles.columnWide : null]}>
      <Text style={styles.columnTitle}>{title}</Text>
      {children}
    </View>
  );

  const link = (label: string, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        styles.link,
        pressed && styles.linkPressed,
      ]}
    >
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.shell}>
      <View style={styles.inner}>
        <View style={[styles.grid, isWide ? styles.gridWide : null]}>
          {column(
            LANDING_FOOTER.product.title,
            LANDING_FOOTER.product.links.map((item) =>
              link(item.label, () => onNavigateSection(item.section))
            )
          )}

          {column(
            LANDING_FOOTER.trust.title,
            LANDING_FOOTER.trust.links.map((item) => {
              if ("external" in item) {
                return link(item.label, openDeletion);
              }
              return link(item.label, () => openDoc(item.doc));
            })
          )}

          {column(
            LANDING_FOOTER.company.title,
            <>
              <Text style={styles.staticLine}>{PUBLIC_BRAND}</Text>
              {link("Contact support", mailSupport)}
              {link(legal.supportEmail, mailSupport)}
              <Text style={styles.staticLine}>Grievance Officer</Text>
              <Text style={styles.mutedLine}>{legal.grievanceOfficer.name}</Text>
              {link(legal.grievanceOfficer.email, mailGrievance)}
            </>
          )}

          {column(
            LANDING_FOOTER.legal.title,
            <>
              <Text style={styles.staticLine}>{DESIGNED_BY_LINE}</Text>
              <Text style={styles.mutedLine}>{legal.legalEntityName}</Text>
              <Text style={styles.mutedLine}>{LANDING_FOOTER.legal.tagline1}</Text>
              <Text style={styles.mutedLine}>{LANDING_FOOTER.legal.tagline2}</Text>
            </>
          )}
        </View>

        <View style={styles.bottomBar}>
          <Text style={styles.copyright}>
            © {new Date().getFullYear()} {PUBLIC_BRAND}. {legal.appName}.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: LANDING_COLORS.cardBorder,
    backgroundColor: LANDING_COLORS.canvasDeep,
  },
  inner: {
    maxWidth: LANDING_LAYOUT.maxWidth,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: LANDING_LAYOUT.sectionPaddingH,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxxl,
    gap: spacing.xxxl,
  },
  grid: {
    gap: spacing.xl,
  },
  gridWide: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  column: {
    gap: spacing.sm,
    minWidth: 160,
  },
  columnWide: {
    width: "22%",
    minWidth: 180,
  },
  columnTitle: {
    ...landingTypography.mono,
    color: LANDING_COLORS.textPrimary,
    marginBottom: spacing.xs,
  },
  link: {
    paddingVertical: 4,
  },
  linkPressed: {
    opacity: 0.75,
  },
  linkText: {
    ...landingTypography.bodySm,
    color: LANDING_COLORS.textSecondary,
  },
  staticLine: {
    ...landingTypography.bodySm,
    color: LANDING_COLORS.textSecondary,
    paddingVertical: 2,
  },
  mutedLine: {
    ...landingTypography.caption,
    color: LANDING_COLORS.textSubtle,
    paddingVertical: 2,
  },
  bottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: LANDING_COLORS.cardBorder,
    paddingTop: spacing.lg,
  },
  copyright: {
    ...landingTypography.caption,
    color: LANDING_COLORS.textSubtle,
    textAlign: "center",
  },
});
