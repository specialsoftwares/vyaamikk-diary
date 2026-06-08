import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Pill } from "@/components/ui";
import { CATEGORIES } from "@/domain/categories";
import type { DiaryCategory } from "@/domain/types";
import { spacing } from "@/theme";
import { useT } from "@/i18n";

interface CategoryPickerProps {
  value: DiaryCategory;
  onChange: (next: DiaryCategory) => void;
}

export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  const t = useT();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}
    >
      {CATEGORIES.map((category) => (
        <View key={category.id} style={styles.gap}>
          <Pill
            label={t(`categories.${category.id}`)}
            active={category.id === value}
            onPress={() => onChange(category.id)}
          />
        </View>
      ))}
    </ScrollView>
  );
}

interface CategoryFilterProps {
  value: DiaryCategory | null;
  onChange: (next: DiaryCategory | null) => void;
}

export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
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
      {CATEGORIES.map((category) => (
        <View key={category.id} style={styles.gap}>
          <Pill
            label={t(`categories.${category.id}`)}
            active={category.id === value}
            onPress={() => onChange(category.id)}
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
