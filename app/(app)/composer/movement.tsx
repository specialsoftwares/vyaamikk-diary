import React, { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { Header, Screen, LocaleUiText } from "@/components/ui";
import { MATERIAL_MOVEMENT_GRIN_OPTION } from "@/domain/composerOptions";
import {
  materialMovementDestinations,
  type MaterialMovementDestination,
} from "@/domain/materialMovementDestinations";
import { isGoodsEvidenceEnabled } from "@/goodsEvidence/featureFlag";
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
  const destinations = useMemo(
    () => materialMovementDestinations({ goodsEvidenceEnabled: isGoodsEvidenceEnabled() }),
    []
  );

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
    (dest: MaterialMovementDestination) => {
      if (dest.kind === "grin_create") {
        // Admission is enforced on the GRIN create screen — never bypass here.
        router.push("/(app)/grin/create");
        return;
      }
      if (dest.kind === "grin_return_select") {
        router.push("/(app)/grin/return-select");
        return;
      }
      router.push({
        pathname: "/(app)/composer/[type]",
        params: {
          type: dest.entryType,
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
        {destinations.map((dest) => {
          const meta = destinationPresentation(dest, t);
          return (
            <MovementOptionRow
              key={meta.key}
              rowKind={meta.rowKind}
              label={meta.label}
              subtitle={meta.subtitle}
              onPress={() => onPick(dest)}
            />
          );
        })}
      </View>
    </Screen>
  );
}

function destinationPresentation(
  dest: MaterialMovementDestination,
  t: (key: string) => string
): {
  key: string;
  rowKind: "sent_transport" | "received" | "return" | "grin";
  label: string;
  subtitle: string;
} {
  if (dest.kind === "grin_create") {
    return {
      key: "grin_create",
      rowKind: "grin",
      label: t(`composer.options.${MATERIAL_MOVEMENT_GRIN_OPTION.labelKey}`),
      subtitle: t(`composer.options.${MATERIAL_MOVEMENT_GRIN_OPTION.subtitleKey}`),
    };
  }
  if (dest.kind === "grin_return_select") {
    return {
      key: "grin_return_select",
      rowKind: "return",
      label: t("composer.options.movementReturn"),
      subtitle: t("composer.options.movementReturnGrinSub"),
    };
  }
  const labelKey =
    dest.movementKind === "sent_transport"
      ? "movementSentTransport"
      : dest.movementKind === "received"
        ? "movementReceived"
        : "movementReturn";
  const subtitleKey =
    dest.movementKind === "sent_transport"
      ? "movementSentTransportSub"
      : dest.movementKind === "received"
        ? "movementReceivedSub"
        : "movementReturnSub";
  return {
    key: dest.movementKind,
    rowKind: dest.movementKind,
    label: t(`composer.options.${labelKey}`),
    subtitle: t(`composer.options.${subtitleKey}`),
  };
}

function MovementOptionRow({
  rowKind,
  label,
  subtitle,
  onPress,
}: {
  rowKind: "sent_transport" | "received" | "return" | "grin";
  label: string;
  subtitle: string;
  onPress: () => void;
}) {
  const accent = useCategoryAccent(
    accentKeyForComposerPickerKey(
      rowKind === "sent_transport"
        ? "material_dispatched"
        : rowKind === "received" || rowKind === "grin"
          ? "material_received"
          : "material_return"
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
    rowKind === "sent_transport"
      ? "truck-delivery-outline"
      : rowKind === "received"
        ? "package-down"
        : rowKind === "grin"
          ? "clipboard-check-outline"
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
