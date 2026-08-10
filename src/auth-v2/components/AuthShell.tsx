import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { AuthActionZone } from "@/auth-v2/components/AuthActionZone";
import {
  AUTH_ACTION_ZONE_ABOVE,
  AUTH_ACTION_ZONE_BELOW,
} from "@/auth-v2/components/authActionZoneLayout";
import { authV2GradientStops, authV2Tokens } from "@/auth-v2/theme/authV2Theme";
import { FormFocusProvider } from "@/components/inputSafety/FormFocusManager";
import { spacing, typography, useTheme } from "@/theme";

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onBack?: () => void;
  showBack?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Row above the title (e.g. stage label + language toggle). */
  headerTop?: React.ReactNode;
  /**
   * `end` — pinned near the device edge (business onboarding).
   * `actionZone` — lower-middle cluster shared with verifying/verified.
   */
  footerPlacement?: "end" | "actionZone";
}

/**
 * Auth/onboarding shell — one keyboard strategy on iOS (KAV padding only).
 * Do not stack automaticallyAdjustKeyboardInsets here; it pushes content off-screen.
 * Action-zone placement keeps auth CTAs in the verifying/verified focal band.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  onBack,
  showBack = true,
  contentStyle,
  headerTop,
  footerPlacement = "end",
}: AuthShellProps) {
  const insets = useSafeAreaInsets();
  const { resolvedMode, colors } = useTheme();
  const isDark = resolvedMode === "dark";
  const tokens = authV2Tokens(colors, isDark);
  const gradient = authV2GradientStops(isDark);
  const useActionZone = footerPlacement === "actionZone" && Boolean(footer);

  return (
    <LinearGradient colors={gradient} style={styles.root}>
      <FormFocusProvider>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <View style={[styles.safe, { paddingTop: insets.top + spacing.sm }]}>
          {showBack && onBack ? (
            <Pressable
              onPress={onBack}
              style={[styles.backBtn, { backgroundColor: tokens.backBtnBg, borderColor: tokens.backBtnBorder }]}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <MaterialCommunityIcons name="chevron-left" size={24} color={tokens.heading} />
            </Pressable>
          ) : (
            <View style={styles.backSpacer} />
          )}

          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[styles.scroll, useActionZone && styles.scrollZone, contentStyle]}
            showsVerticalScrollIndicator={false}
          >
            {headerTop}
            <Text style={[styles.title, { color: tokens.heading }]} accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: tokens.body }]}>{subtitle}</Text>
            ) : null}
            {children}
            {useActionZone ? (
              <>
                <View style={styles.zoneAbove} />
                <AuthActionZone>{footer}</AuthActionZone>
                <View
                  style={[
                    styles.zoneBelow,
                    { minHeight: Math.max(insets.bottom, spacing.md) },
                  ]}
                />
              </>
            ) : null}
          </ScrollView>

          {!useActionZone && footer ? (
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
              {footer}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
      </FormFocusProvider>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  safe: { flex: 1 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.lg,
    marginBottom: spacing.md,
  },
  backSpacer: { height: 40, marginBottom: spacing.md },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  scrollZone: {
    paddingBottom: spacing.sm,
  },
  zoneAbove: {
    flexGrow: AUTH_ACTION_ZONE_ABOVE,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 24,
  },
  zoneBelow: {
    flexGrow: AUTH_ACTION_ZONE_BELOW,
    flexShrink: 1,
    flexBasis: 0,
  },
  title: {
    ...typography.displayMd,
    fontSize: 28,
    lineHeight: 34,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
});
