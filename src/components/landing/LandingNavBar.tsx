import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { LandingButton } from "@/components/landing/LandingButton";
import { LANDING_NAV } from "@/components/landing/landingCopy";
import { LANDING_COLORS, LANDING_LAYOUT, landingTypography } from "@/components/landing/landingTokens";
import { getAuthEntryHref } from "@/config/authWrapper";
import { radius, spacing } from "@/theme";

export type LandingSectionKey = "platform" | "security" | "workflows" | "compliance" | "contact";

interface LandingNavBarProps {
  onNavigateSection: (key: LandingSectionKey) => void;
}

const NAV_ITEMS: { key: LandingSectionKey; label: string }[] = [
  { key: "platform", label: LANDING_NAV.platform },
  { key: "security", label: LANDING_NAV.security },
  { key: "workflows", label: LANDING_NAV.workflows },
  { key: "compliance", label: LANDING_NAV.compliance },
  { key: "contact", label: LANDING_NAV.contact },
];

export function LandingNavBar({ onNavigateSection }: LandingNavBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompact = width < LANDING_LAYOUT.breakpointTablet;
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goAuth = useCallback(() => router.push(getAuthEntryHref()), [router]);
  const goLegal = useCallback(
    () => router.push({ pathname: "/legal/[doc]", params: { doc: "privacy" } }),
    [router]
  );

  const navItem = (key: LandingSectionKey, label: string) => (
    <Pressable
      key={key}
      accessibilityRole="link"
      onPress={() => {
        setMenuOpen(false);
        onNavigateSection(key);
      }}
      style={({ pressed }) => [
        styles.navLink,
        pressed && Platform.OS === "web" ? styles.navLinkHover : null,
      ]}
    >
      <Text style={styles.navLinkText}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <View
        style={[
          styles.shell,
          {
            paddingTop: insets.top + spacing.sm,
            backgroundColor: scrolled ? "rgba(18,21,46,0.92)" : "rgba(30,27,75,0.55)",
            borderBottomColor: scrolled ? LANDING_COLORS.cardBorder : "transparent",
          },
        ]}
      >
        <View style={styles.inner}>
          <Pressable accessibilityRole="header" onPress={() => onNavigateSection("platform")}>
            <Text style={landingTypography.wordmark}>VYAAMIKK</Text>
            <Text style={landingTypography.wordmarkSub}>DIARY</Text>
          </Pressable>

          {!isCompact ? (
            <View style={styles.desktopNav}>{NAV_ITEMS.map((item) => navItem(item.key, item.label))}</View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open menu"
              onPress={() => setMenuOpen(true)}
              style={styles.menuBtn}
            >
              <MaterialCommunityIcons name="menu" size={24} color={LANDING_COLORS.textPrimary} />
            </Pressable>
          )}

          {!isCompact ? (
            <View style={styles.actions}>
              <Pressable accessibilityRole="link" onPress={goLegal}>
                <Text style={styles.legalLink}>{LANDING_NAV.viewLegal}</Text>
              </Pressable>
              <LandingButton
                label={LANDING_NAV.startSecurely}
                onPress={goAuth}
                style={styles.ctaCompact}
              />
            </View>
          ) : null}
        </View>
      </View>

      <Modal visible={menuOpen} animationType="fade" transparent onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menuSheet, { paddingTop: insets.top + spacing.lg }]}>
            {NAV_ITEMS.map((item) => navItem(item.key, item.label))}
            <LandingButton label={LANDING_NAV.viewLegal} variant="ghost" onPress={goLegal} />
            <LandingButton label={LANDING_NAV.startSecurely} onPress={goAuth} />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const shellBase = Platform.OS === "web"
  ? ({ position: "sticky", top: 0, left: 0, right: 0, zIndex: 100 } as object)
  : { position: "absolute" as const, top: 0, left: 0, right: 0, zIndex: 100 };

const styles = StyleSheet.create({
  shell: {
    ...shellBase,
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...(Platform.OS === "web"
      ? ({ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" } as object)
      : null),
  },
  inner: {
    maxWidth: LANDING_LAYOUT.maxWidth,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: LANDING_LAYOUT.sectionPaddingH,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  desktopNav: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  navLink: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  navLinkHover: {
    opacity: 0.85,
  },
  navLinkText: {
    ...landingTypography.caption,
    color: LANDING_COLORS.textSecondary,
    fontSize: 13,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  legalLink: {
    ...landingTypography.caption,
    color: LANDING_COLORS.accent,
    fontSize: 13,
  },
  ctaCompact: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
  },
  menuBtn: {
    padding: spacing.sm,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(6,7,13,0.72)",
  },
  menuSheet: {
    backgroundColor: LANDING_COLORS.canvasDeep,
    padding: spacing.xl,
    gap: spacing.md,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
});
