import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

interface PermissionRationaleModalProps {
  visible: boolean;
  title: string;
  body: string;
  allowLabel: string;
  notNowLabel: string;
  onAllow: () => void;
  onDismiss: () => void;
  loading?: boolean;
}

export function PermissionRationaleModal({
  visible,
  title,
  body,
  allowLabel,
  notNowLabel,
  onAllow,
  onDismiss,
  loading = false,
}: PermissionRationaleModalProps) {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay },
      wrap: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: spacing.lg,
      },
      sheet: {
        width: "100%",
        maxWidth: 420,
        backgroundColor: c.surface,
        borderRadius: radius.xl,
        padding: spacing.xl,
        gap: spacing.md,
      },
      iconBubble: {
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: c.primaryLight,
        alignSelf: "center",
        marginBottom: spacing.xs,
      },
      title: { ...typography.titleLg, color: c.text, textAlign: "center" },
      body: { ...typography.body, color: c.textMuted, textAlign: "center", lineHeight: 22 },
      actions: { marginTop: spacing.md, gap: spacing.sm },
    })
  );
  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={loading ? undefined : onDismiss} />
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.iconBubble} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.actions}>
            <Button label={allowLabel} onPress={onAllow} loading={loading} />
            <Button label={notNowLabel} onPress={onDismiss} variant="ghost" disabled={loading} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
