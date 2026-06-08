import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";
import type { CategoryAccentKey } from "@/theme/categoryAccents";
import { useCategoryAccent } from "@/theme/useBrandTokens";

export type ExecutiveStatusKind =
  | "saved_local"
  | "synced"
  | "draft"
  | "pdf_generated"
  | "reminder_due"
  | "statutory"
  | "pin_approx"
  | "gps"
  | "doc_history"
  | "user_record"
  | "local_first"
  | "activity";

const STATUS_ACCENT: Record<ExecutiveStatusKind, CategoryAccentKey> = {
  saved_local: "work",
  synced: "map",
  draft: "work",
  pdf_generated: "letterhead",
  reminder_due: "reminder",
  statutory: "statutory",
  pin_approx: "reminder",
  gps: "map",
  doc_history: "letterhead",
  user_record: "work",
  local_first: "work",
  activity: "work",
};

const STATUS_ICON: Partial<
  Record<ExecutiveStatusKind, keyof typeof MaterialCommunityIcons.glyphMap>
> = {
  saved_local: "content-save-outline",
  synced: "cloud-check-outline",
  draft: "file-edit-outline",
  pdf_generated: "file-pdf-box",
  reminder_due: "bell-outline",
  statutory: "shield-check-outline",
  pin_approx: "map-marker-radius-outline",
  gps: "crosshairs-gps",
  doc_history: "history",
  user_record: "account-outline",
  local_first: "cellphone-check",
  activity: "clock-outline",
};

interface ExecutiveStatusChipProps {
  kind: ExecutiveStatusKind;
  /** Override i18n label */
  label?: string;
}

function ExecutiveStatusChipInner({ kind, label }: ExecutiveStatusChipProps) {
  const t = useT();
  const accentKey = STATUS_ACCENT[kind];
  const accent = useCategoryAccent(accentKey);
  const icon = STATUS_ICON[kind];
  const text = label ?? t(`executive.status.${kind}`);

  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      chip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-start",
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: radius.pill,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        maxWidth: "100%",
      },
      text: {
        ...typography.micro,
        color: c.text,
        fontWeight: "600",
        letterSpacing: 0.2,
      },
    })
  );

  return (
    <Animated.View
      style={[
        styles.chip,
        { backgroundColor: accent.soft, borderColor: accent.main + "30", opacity: fade },
      ]}
    >
      {icon ? (
        <MaterialCommunityIcons name={icon} size={12} color={accent.main} />
      ) : null}
      <Text style={styles.text} numberOfLines={1}>
        {text}
      </Text>
    </Animated.View>
  );
}

export const ExecutiveStatusChip = memo(ExecutiveStatusChipInner);
