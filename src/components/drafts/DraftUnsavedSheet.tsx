import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { PremiumActionButton } from "@/components/ui/PremiumActionButton";
import { useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

export interface DraftUnsavedSheetProps {
  visible: boolean;
  title?: string;
  body?: string;
  saveLabel?: string;
  /** When false, only discard / continue (empty or unchanged form). */
  showSaveDraft?: boolean;
  onSaveDraft: () => void;
  onDiscard: () => void;
  onContinueEditing: () => void;
  saving?: boolean;
}

export function DraftUnsavedSheet({
  visible,
  title,
  body,
  saveLabel,
  showSaveDraft = true,
  onSaveDraft,
  onDiscard,
  onContinueEditing,
  saving = false,
}: DraftUnsavedSheetProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      backdrop: {
        flex: 1,
        backgroundColor: c.overlay,
        justifyContent: "flex-end",
      },
      sheet: {
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        backgroundColor: c.surface,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
      },
      handle: {
        alignSelf: "center",
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: c.divider,
        marginBottom: spacing.md,
      },
      title: { ...typography.titleMd, color: c.text },
      body: {
        ...typography.caption,
        color: c.textMuted,
        marginTop: spacing.xs,
        marginBottom: spacing.md,
      },
      actions: { gap: spacing.sm },
    })
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onContinueEditing}
    >
      <Pressable style={styles.backdrop} onPress={onContinueEditing}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          {title ? (
            <Text style={styles.title}>{title}</Text>
          ) : (
            <LocaleUiText style={styles.title}>
              {showSaveDraft ? t("drafts.unsavedTitle") : t("drafts.unsavedDiscardTitle")}
            </LocaleUiText>
          )}
          {body ? (
            <Text style={styles.body}>{body}</Text>
          ) : (
            <LocaleUiText style={styles.body}>
              {showSaveDraft ? t("drafts.unsavedBody") : t("drafts.unsavedDiscardBody")}
            </LocaleUiText>
          )}
          <View style={styles.actions}>
            {showSaveDraft ? (
              <PremiumActionButton
                label={saveLabel ?? t("composer.saveDraft")}
                onPress={onSaveDraft}
                variant="primary"
                loading={saving}
                disabled={saving}
              />
            ) : null}
            <PremiumActionButton
              label={t("drafts.discardChanges")}
              onPress={onDiscard}
              variant="ghost"
              disabled={saving}
            />
            <PremiumActionButton
              label={t("common.continueEditing")}
              onPress={onContinueEditing}
              variant="glass"
              disabled={saving}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
