import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { Header, Screen, LocaleUiText } from "@/components/ui";
import {
  MATERIAL_MOVEMENT_SUB_OPTIONS,
  entryTypeForMovementKind,
} from "@/domain/composerOptions";
import type { MaterialMovementKind } from "@/domain/materialMovement";
import { useT } from "@/i18n";
import { useSmartBack, requestComposerPickerReturn } from "@/navigation";
import { LuxuryPressable } from "@/components/ui/LuxuryPressable";
import { executiveCardDepth } from "@/theme/cardDepth";
import { spacing, typography, useTheme, useThemedStyles } from "@/theme";
import { accentKeyForComposerPickerKey } from "@/theme/categoryAccentResolver";
import { useCategoryAccent } from "@/theme/useBrandTokens";

export default function MaterialMovementPickerScreen() {
  const t = useT();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      intro: { ...typography.body, color: c.textMuted, marginBottom: spacing.lg },
      list: { gap: spacing.sm + 2 },
    })
  );

  const { performBack } = useSmartBack({
    from: from ?? "you",
    dirty: false,
    handleHardwareBack: false,
  });

  const navigateBack = useCallback(() => {
    requestComposerPickerReturn("picker");
    if (router.canGoBack()) {
      router.back();
    } else {
      performBack();
    }
  }, [router, performBack]);

  const onPick = useCallback(
    (kind: MaterialMovementKind) => {
      const type = entryTypeForMovementKind(kind);
      router.push({
        pathname: "/(app)/composer/[type]",
        params: {
          type,
          from: "movement",
          pickerReturn: "material_movement",
        },
      });
    },
    [router]
  );

  return (
    <Screen padded>
      <Header title={t("materialMovement.pickerTitle")} showBack onBackPress={navigateBack} />
      <LocaleUiText style={styles.intro}>{t("materialMovement.pickerQuestion")}</LocaleUiText>
      <View style={styles.list}>
        {MATERIAL_MOVEMENT_SUB_OPTIONS.map((opt) => (
          <MovementOptionRow
            key={opt.kind}
            kind={opt.kind}
            label={t(`composer.options.${opt.labelKey}`)}
            subtitle={t(`composer.options.${opt.subtitleKey}`)}
            onPress={() => onPick(opt.kind)}
          />
        ))}
      </View>
    </Screen>
  );
}

function MovementOptionRow({
  kind,
  label,
  subtitle,
  onPress,
}: {
  kind: MaterialMovementKind;
  label: string;
  subtitle: string;
  onPress: () => void;
}) {
  const accent = useCategoryAccent(
    accentKeyForComposerPickerKey(
      kind === "sent_transport"
        ? "material_dispatched"
        : kind === "received"
          ? "material_received"
          : kind === "return"
            ? "material_return"
            : "material_dispatched"
    )
  );
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: {
        ...executiveCardDepth(isDark, c, 3),
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        padding: spacing.md + 2,
      },
      iconBubble: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: accent.soft,
      },
      rowText: { flex: 1, gap: 2 },
      rowTitle: { ...typography.bodyStrong, color: c.text },
      rowSub: { ...typography.caption, color: c.textMuted },
      chevron: { ...typography.titleSm, color: c.textMuted },
    })
  );

  const icon =
    kind === "sent_transport"
      ? "truck-delivery-outline"
      : kind === "received"
        ? "package-down"
        : "swap-horizontal";

  return (
    <LuxuryPressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <View style={styles.iconBubble}>
        <MaterialCommunityIcons name={icon} size={22} color={accent.main} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </LuxuryPressable>
  );
}
