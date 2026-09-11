import React, { useMemo, useRef, type RefObject } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardFormScrollProvider } from "@/components/forms/KeyboardFormScrollContext";
import { FormFocusProvider } from "@/components/inputSafety/FormFocusManager";
import { ValidationFocusProvider } from "@/components/inputSafety/ValidationFocusManager";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { tabBarFooterClearance, useTabBarMetrics } from "@/layout/tabBar";
import { spacing, useThemeColors, useThemedStyles } from "@/theme";

/** Extra space below last field so Save / suggestions stay above keyboard. */
const FORM_KEYBOARD_EXTRA_PADDING = spacing.xl + spacing.lg;

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** When true, tapping outside an input dismisses the keyboard (non-scroll screens only). */
  dismissKeyboardOnTap?: boolean;
  topInsetOverride?: number;
  /**
   * Reserve space for the floating glass tab bar so the last row stays
   * reachable while scroll content passes underneath.
   */
  tabBarInset?: boolean;
  /** Extra bottom padding inside scroll/content (e.g. floating action button). */
  extraBottomPadding?: number;
  /** Pinned bar below scroll content (e.g. primary action) — not overlaid on the list. */
  footer?: React.ReactNode;
  /**
   * Keyboard-safe form mode: avoiding view, keyboard padding, scroll-to-focus context,
   * and iOS automatic insets. Prefer over bare `keyboardAvoiding`.
   */
  form?: boolean;
  /** @deprecated Use `form` for record/profile entry screens. */
  keyboardAvoiding?: boolean;
  /** Ref to the inner ScrollView when `scroll` is true. */
  scrollRef?: RefObject<ScrollView | null>;
  /** Native pull-to-refresh (read-only list / dashboard screens only). */
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  contentStyle,
  dismissKeyboardOnTap = true,
  topInsetOverride,
  tabBarInset = false,
  extraBottomPadding = 0,
  footer,
  form = false,
  keyboardAvoiding = false,
  scrollRef,
  refreshing = false,
  onRefresh,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const tabBar = useTabBarMetrics();
  const colors = useThemeColors();
  const isFormScreen = form || keyboardAvoiding;
  const keyboardHeight = useKeyboardInset(isFormScreen && scroll);
  const useIosScrollKeyboardInsets =
    isFormScreen && scroll && Platform.OS === "ios";
  const useAndroidKeyboardPadding =
    isFormScreen && scroll && Platform.OS === "android";
  const internalScrollRef = useRef<ScrollView>(null);
  const effectiveScrollRef = scrollRef ?? internalScrollRef;

  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      safe: { flex: 1, backgroundColor: colors.background },
      flex: { flex: 1 },
      padded: { padding: spacing.lg },
      footerBar: {
        borderTopWidth: 1,
        borderTopColor: colors.divider,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.md,
      },
    })
  );

  const bottomPadding = useMemo(() => {
    if (footer) {
      return spacing.md + extraBottomPadding;
    }
    const base = tabBarInset
      ? tabBar.contentPaddingBottom
      : insets.bottom + spacing.xl;
    let total = base + extraBottomPadding;
    if (isFormScreen) {
      if (useAndroidKeyboardPadding) {
        total += keyboardHeight + FORM_KEYBOARD_EXTRA_PADDING;
      } else {
        total += FORM_KEYBOARD_EXTRA_PADDING;
      }
    }
    return total;
  }, [
    footer,
    tabBarInset,
    tabBar.contentPaddingBottom,
    insets.bottom,
    extraBottomPadding,
    isFormScreen,
    keyboardHeight,
    useAndroidKeyboardPadding,
  ]);

  const contentContainerStyle = useMemo(
    () => [padded && styles.padded, { paddingBottom: bottomPadding }, contentStyle],
    [padded, styles.padded, bottomPadding, contentStyle]
  );

  const keyboardVerticalOffset = Platform.OS === "ios" ? insets.top : 0;

  // Wrapping ScrollView in Pressable steals pan gestures and causes scroll to
  // stick — use keyboardDismissMode on the scroll view instead.
  if (scroll) {
    const scrollBody = (
      <ScrollView
        ref={effectiveScrollRef}
        style={styles.flex}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps={isFormScreen ? "always" : "handled"}
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        overScrollMode="never"
        removeClippedSubviews={Platform.OS === "android" && !isFormScreen}
        automaticallyAdjustKeyboardInsets={useIosScrollKeyboardInsets}
        contentInsetAdjustmentBehavior={isFormScreen ? "automatic" : "never"}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          ) : undefined
        }
      >
        {isFormScreen ? (
          <KeyboardFormScrollProvider scrollRef={effectiveScrollRef} enabled>
            <FormFocusProvider>
              <ValidationFocusProvider scrollRef={effectiveScrollRef}>
                {children}
              </ValidationFocusProvider>
            </FormFocusProvider>
          </KeyboardFormScrollProvider>
        ) : (
          children
        )}
      </ScrollView>
    );

    return (
      <SafeAreaView
        style={[
          styles.safe,
          topInsetOverride !== undefined ? { paddingTop: topInsetOverride } : null,
        ]}
        edges={["top", "left", "right"]}
      >
        <StatusBar barStyle={Platform.OS === "ios" ? "default" : "default"} translucent />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          enabled={isFormScreen && Platform.OS === "android"}
          keyboardVerticalOffset={keyboardVerticalOffset}
        >
          <View style={styles.flex}>
            {scrollBody}
            {footer ? (
              <View
                style={[
                  styles.footerBar,
                  // Native tab bar clips content at its top edge on Android and
                  // overlays it on iOS — clearance must derive from the shared
                  // metrics model, never a per-screen constant (VYD-23).
                  tabBarInset
                    ? { paddingBottom: tabBarFooterClearance(tabBar) }
                    : { paddingBottom: insets.bottom + spacing.sm },
                ]}
              >
                {footer}
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const inner = (
    <View
      style={[
        styles.flex,
        padded && styles.padded,
        { paddingBottom: bottomPadding },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView
      style={[
        styles.safe,
        topInsetOverride !== undefined ? { paddingTop: topInsetOverride } : null,
      ]}
      edges={["top", "left", "right"]}
    >
      <StatusBar barStyle={Platform.OS === "ios" ? "default" : "default"} translucent />
      {dismissKeyboardOnTap ? (
        <Pressable style={styles.flex} onPress={Keyboard.dismiss} accessible={false}>
          {inner}
        </Pressable>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}
