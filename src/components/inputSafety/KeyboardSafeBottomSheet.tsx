import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

interface KeyboardSafeBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  sheetStyle?: StyleProp<ViewStyle>;
}

/**
 * Bottom sheet / modal with inputs — resizes for keyboard, scrollable body,
 * persistent taps, and reachable footer actions.
 */
export function KeyboardSafeBottomSheet({
  visible,
  onClose,
  title,
  children,
  footer,
  sheetStyle,
}: KeyboardSafeBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardInset(visible);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      backdrop: {
        flex: 1,
        backgroundColor: c.overlay,
        justifyContent: "flex-end",
      },
      avoiding: { flex: 1, justifyContent: "flex-end" },
      sheet: {
        backgroundColor: c.surface,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        maxHeight: "88%",
        overflow: "hidden",
      },
      header: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.divider,
      },
      title: { ...typography.titleSm, color: c.text },
      scrollContent: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        gap: spacing.md,
      },
      footer: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: c.divider,
        gap: spacing.sm,
      },
    })
  );

  const bottomPad =
    Math.max(insets.bottom, spacing.md) +
    (Platform.OS === "android" ? keyboardHeight : 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.avoiding}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
          <Pressable style={[styles.sheet, sheetStyle]} onPress={() => {}}>
            {title ? (
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
              </View>
            ) : null}
            <ScrollView
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: spacing.md },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
            {footer ? (
              <View style={[styles.footer, { paddingBottom: bottomPad }]}>{footer}</View>
            ) : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
