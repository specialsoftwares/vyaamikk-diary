import React from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { BootComposerDraftContinuation } from "@/boot/resolveBootRoute";
import { PremiumActionButton } from "@/components/ui/PremiumActionButton";
import { useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";
import { formatRelative } from "@/utils/date";

export interface BootDraftContinuationSheetProps {
  visible: boolean;
  continuation: BootComposerDraftContinuation | null;
  onContinue: () => void;
  onLater: () => void;
  onViewDrafts: () => void;
}

/** Compact boot prompt — does not dominate the screen. */
export function BootDraftContinuationSheet({
  visible,
  continuation,
  onContinue,
  onLater,
  onViewDrafts,
}: BootDraftContinuationSheetProps) {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      backdrop: {
        flex: 1,
        backgroundColor: c.overlay,
        justifyContent: "flex-end",
      },
      card: {
        marginHorizontal: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: c.surface,
        padding: spacing.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        maxWidth: 420,
        alignSelf: "center",
        width: "100%",
      },
      title: { ...typography.titleMd, color: c.text },
      body: {
        ...typography.caption,
        color: c.textMuted,
        marginTop: spacing.xs,
        lineHeight: 20,
      },
      meta: {
        ...typography.captionStrong,
        color: c.textSubtle,
        marginTop: spacing.sm,
      },
      actions: { gap: spacing.sm, marginTop: spacing.md },
    })
  );

  if (!continuation) return null;

  const recordLabel = t(continuation.recordLabelKey);
  const when = formatRelative(continuation.updatedAt);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onLater}>
      <Pressable style={styles.backdrop} onPress={onLater}>
        <Pressable
          style={[styles.card, { marginBottom: insets.bottom + spacing.md }]}
          onPress={(e) => e.stopPropagation()}
        >
          <LocaleUiText style={styles.title}>{t("boot.draftContinuation.title")}</LocaleUiText>
          <LocaleUiText style={styles.body}>{t("boot.draftContinuation.body")}</LocaleUiText>
          <Text style={styles.meta}>
            {recordLabel} · {t("boot.draftContinuation.edited", { when })}
          </Text>
          <View style={styles.actions}>
            <PremiumActionButton
              label={t("boot.draftContinuation.continue")}
              onPress={onContinue}
              variant="primary"
            />
            <PremiumActionButton
              label={t("boot.draftContinuation.later")}
              onPress={onLater}
              variant="glass"
            />
            <PremiumActionButton
              label={t("boot.draftContinuation.viewDrafts")}
              onPress={() => {
                onViewDrafts();
                router.push("/(app)/drafts");
              }}
              variant="ghost"
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
