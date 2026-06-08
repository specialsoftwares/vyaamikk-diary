import { Platform, StyleSheet } from "react-native";

import { BRAND_GOLD, BRAND_SURFACE } from "@/config/brandMotion";
import { radius, spacing } from "@/theme";

/** Premium corporate landing canvas — aligned with boot/auth surfaces. */
export const LANDING_COLORS = {
  canvas: BRAND_SURFACE,
  canvasDeep: "#12152E",
  canvasBottom: "#06070D",
  gradientTop: "#1E2468",
  textPrimary: "#F2F3F8",
  textSecondary: "rgba(255,255,255,0.72)",
  textMuted: "rgba(255,255,255,0.55)",
  textSubtle: "rgba(255,255,255,0.42)",
  accent: "#8B91FF",
  accentSoft: "rgba(139,145,255,0.18)",
  accentBorder: "rgba(139,145,255,0.28)",
  gold: BRAND_GOLD,
  cardBg: "rgba(18,21,46,0.88)",
  cardBorder: "rgba(255,255,255,0.12)",
  ctaPrimaryBg: "#FFFFFF",
  ctaPrimaryText: "#3730A3",
  ctaGhostBorder: "rgba(255,255,255,0.28)",
} as const;

export const LANDING_LAYOUT = {
  maxWidth: 1200,
  sectionPaddingH: spacing.xl,
  sectionPaddingV: spacing.xxxl,
  breakpointTablet: 768,
  breakpointDesktop: 1024,
} as const;

export const landingTypography = StyleSheet.create({
  display: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "700",
    letterSpacing: -0.6,
    color: LANDING_COLORS.textPrimary,
  },
  displaySm: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: LANDING_COLORS.textPrimary,
  },
  sectionTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: LANDING_COLORS.textPrimary,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400",
    color: LANDING_COLORS.textSecondary,
  },
  bodySm: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "400",
    color: LANDING_COLORS.textSecondary,
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: LANDING_COLORS.textMuted,
  },
  mono: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    letterSpacing: 0.8,
    color: LANDING_COLORS.textMuted,
    textTransform: "uppercase",
  },
  wordmark: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: LANDING_COLORS.textPrimary,
  },
  wordmarkSub: {
    fontSize: 10,
    fontWeight: "300",
    letterSpacing: 4,
    color: LANDING_COLORS.textMuted,
    textTransform: "uppercase",
  },
});
