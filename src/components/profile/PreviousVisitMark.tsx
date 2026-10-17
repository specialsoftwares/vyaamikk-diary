import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { previousVisitCopy } from "@/content/profile/previousVisitCopy";
import type { PreviousVisitSnapshot } from "@/session/previousVisit";
import { useI18n } from "@/i18n";
import { typography, useThemedStyles } from "@/theme";
import { formatDisplayTimestamp } from "@/utils/greeting";

interface PreviousVisitMarkProps {
  snapshot: PreviousVisitSnapshot;
}

/** Front-of-card previous visit. Font scaling stays at the platform default. */
export function PreviousVisitMark({ snapshot }: PreviousVisitMarkProps) {
  const { lang } = useI18n();
  const copy = previousVisitCopy(lang);
  const when =
    snapshot.kind === "previous" && snapshot.previousVisitAt != null
      ? formatDisplayTimestamp(snapshot.previousVisitAt)
      : null;
  const value =
    snapshot.kind === "previous" && when
      ? when
      : snapshot.kind === "first"
        ? copy.first
        : copy.unavailable;

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      block: {
        flexShrink: 1,
        maxWidth: "100%",
        alignItems: "flex-end",
      },
      label: {
        ...typography.micro,
        color: c.textSubtle,
        textAlign: "right",
      },
      value: {
        ...typography.micro,
        fontWeight: "600",
        color: c.textMuted,
        textAlign: "right",
      },
    })
  );

  return (
    <View style={styles.block}>
      <LocaleUiText style={styles.label}>{copy.label}</LocaleUiText>
      {when ? (
        <Text style={styles.value}>{when}</Text>
      ) : (
        <LocaleUiText style={styles.value}>{value}</LocaleUiText>
      )}
    </View>
  );
}
