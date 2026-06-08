import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card, LocaleUiText } from "@/components/ui";
import { CategoryAccentChip } from "@/components/ui/CategoryAccentChip";
import type { BusinessEntry } from "@/domain/businessEntry";
import { spacing, typography, useThemedStyles } from "@/theme";
import { accentKeyForEntryType } from "@/theme/categoryAccentResolver";
import { formatEntryDate } from "@/utils/date";
import { movementEntryTypeLabelKey } from "@/domain/materialMovement";
import { entryListSummary, entryTypeLabelKey } from "@/utils/businessEntry/display";
import { useT } from "@/i18n";

interface EntryRowProps {
  entry: BusinessEntry;
  onPress?: () => void;
  /** Stronger border + shadow for dashboard previews (default flat for long lists). */
  raised?: boolean;
}

function EntryRowComponent({ entry, onPress, raised = false }: EntryRowProps) {
  const t = useT();
  const accentKey = accentKeyForEntryType(entry.entryType);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      headerRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: spacing.sm,
      },
      title: { ...typography.titleSm, color: c.text, flex: 1 },
      date: { ...typography.caption, color: c.textMuted },
      metaRow: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: spacing.sm,
        gap: spacing.sm,
        flexWrap: "wrap",
      },
      summary: { ...typography.body, color: c.textMuted, marginTop: spacing.sm },
      metaBell: { ...typography.caption, color: c.textMuted },
    })
  );
  const summary = entryListSummary(entry, t);
  const movementLabelKey = movementEntryTypeLabelKey(entry.entryType);
  const typeLabel = movementLabelKey
    ? t(movementLabelKey)
    : t(entryTypeLabelKey(entry.entryType));
  return (
    <Card onPress={onPress} elevated={raised} testID={`entry-${entry.id}`}>
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={styles.date}>{formatEntryDate(entry.entryDate)}</Text>
      </View>
      <View style={styles.metaRow}>
        <CategoryAccentChip
          accentKey={accentKey}
          label={typeLabel}
          compact
        />
        {entry.reminder ? (
          <LocaleUiText style={styles.metaBell}>{t("diary.reminder.badge")}</LocaleUiText>
        ) : null}
      </View>
      {summary ? (
        <Text style={styles.summary} numberOfLines={2}>
          {summary}
        </Text>
      ) : null}
    </Card>
  );
}

export const EntryRow = memo(EntryRowComponent);
