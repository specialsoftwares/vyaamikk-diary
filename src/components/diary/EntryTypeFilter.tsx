import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Pill } from "@/components/ui";
import { DIARY_ENTRY_TYPE_FILTERS } from "@/domain/composerOptions";
import type { BusinessEntryType } from "@/domain/businessEntry";

export type DiaryEntryFilterType = BusinessEntryType | "material_movement" | null;
import { accentKeyForEntryType } from "@/theme/categoryAccentResolver";
import { spacing } from "@/theme";
import { useT } from "@/i18n";

interface EntryTypeFilterProps {
  value: DiaryEntryFilterType;
  onChange: (next: DiaryEntryFilterType) => void;
}

export function EntryTypeFilter({ value, onChange }: EntryTypeFilterProps) {
  const t = useT();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}
    >
      <View style={styles.gap}>
        <Pill label={t("diary.filterAll")} active={value === null} onPress={() => onChange(null)} />
      </View>
      {DIARY_ENTRY_TYPE_FILTERS.map((opt) => (
        <View key={opt.type} style={styles.gap}>
          <Pill
            label={t(`composer.options.${opt.labelKey}`)}
            active={value === opt.type}
            onPress={() => onChange(opt.type)}
            accentKey={
              opt.type === "material_movement"
                ? "material"
                : accentKeyForEntryType(opt.type)
            }
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", paddingHorizontal: spacing.xs },
  gap: { marginRight: spacing.sm },
});
