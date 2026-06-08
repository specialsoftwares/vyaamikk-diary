import React from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { StatutoryPromptCard } from "@/domain/statutoryInfo";
import { PremiumActionButton } from "@/components/ui/PremiumActionButton";
import { useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

export interface StatutoryPromptSheetProps {
  visible: boolean;
  cards: StatutoryPromptCard[];
  onDismissThanks: () => void;
  onSnoozeLater: () => void;
  onOpenTab: () => void;
}

export function StatutoryPromptSheet({
  visible,
  cards,
  onDismissThanks,
  onSnoozeLater,
  onOpenTab,
}: StatutoryPromptSheetProps) {
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
      sheet: {
        maxHeight: "72%",
        marginHorizontal: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: c.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        overflow: "hidden",
      },
      header: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.sm,
      },
      title: { ...typography.titleMd, color: c.text },
      subtitle: {
        ...typography.caption,
        color: c.textMuted,
        marginTop: spacing.xs,
        lineHeight: 20,
      },
      scroll: { maxHeight: 340 },
      scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
      card: {
        backgroundColor: c.surfaceMuted,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
      },
      cardHead: { ...typography.captionStrong, color: c.text },
      cardMeta: { ...typography.caption, color: c.primary, marginTop: 2 },
      cardBody: {
        ...typography.caption,
        color: c.textMuted,
        marginTop: spacing.xs,
        lineHeight: 18,
      },
      cardApply: { ...typography.micro, color: c.textSubtle, marginTop: spacing.xs },
      footerNote: {
        ...typography.micro,
        color: c.textSubtle,
        textAlign: "center",
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.sm,
        lineHeight: 16,
      },
      actions: {
        padding: spacing.lg,
        gap: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: c.divider,
      },
    })
  );

  if (!cards.length) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSnoozeLater}>
      <Pressable style={styles.backdrop} onPress={onSnoozeLater}>
        <Pressable
          style={[styles.sheet, { marginBottom: insets.bottom + spacing.md }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <LocaleUiText style={styles.title}>{t("statutory.prompt.title")}</LocaleUiText>
            <LocaleUiText style={styles.subtitle}>{t("statutory.prompt.subtitle")}</LocaleUiText>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {cards.map((card) => (
              <View key={card.occurrenceId} style={styles.card}>
                <Text style={styles.cardHead}>
                  {card.periodLine ? `${card.title} — ${card.periodLine}` : card.title}
                </Text>
                <Text style={styles.cardMeta}>{card.dueLine}</Text>
                <LocaleUiText style={styles.cardMeta}>
                  {t("statutory.card.daysLeft", { days: card.daysLeft })}
                </LocaleUiText>
                <Text style={styles.cardApply}>{card.applicability}</Text>
                <Text style={styles.cardBody}>{card.body}</Text>
                <Text style={styles.cardApply}>{card.caution}</Text>
              </View>
            ))}
          </ScrollView>
          <LocaleUiText style={styles.footerNote}>{t("statutory.prompt.footer")}</LocaleUiText>
          <View style={styles.actions}>
            <PremiumActionButton
              label={t("statutory.prompt.okThanks")}
              onPress={onDismissThanks}
              variant="primary"
            />
            <PremiumActionButton
              label={t("statutory.prompt.laterToday")}
              onPress={onSnoozeLater}
              variant="glass"
            />
            <PremiumActionButton
              label={t("statutory.prompt.openTab")}
              onPress={() => {
                onOpenTab();
                router.push("/statutory");
              }}
              variant="ghost"
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
