import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";

import { Header, Screen, SmartHeadline, LocaleUiText } from "@/components/ui";
import type { ProfessionalCategory } from "@/domain/professionalPack";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";
import { requestComposerPickerReturn } from "@/navigation";

const CATEGORIES: ProfessionalCategory[] = ["ca_tax", "cs_compliance", "legal"];

export default function ProfessionalPackCategoryScreen() {
  const t = useT();
  const router = useRouter();
  const { fromPicker } = useLocalSearchParams<{ fromPicker?: string }>();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      lead: { ...typography.body, color: c.textMuted, marginBottom: spacing.lg, lineHeight: 22 },
      list: { gap: spacing.sm },
      row: {
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: 12,
        backgroundColor: c.surfaceMuted,
      },
      rowText: { ...typography.bodyStrong, color: c.text },
      rowSub: { ...typography.caption, color: c.textMuted, marginTop: 4 },
    })
  );

  return (
    <Screen scroll>
      <Header
        title={t("proPack.title")}
        showBack
        backFrom="you"
        onBackPress={() => {
          if (fromPicker === "1") {
            requestComposerPickerReturn("picker");
          }
          if (router.canGoBack()) router.back();
          else router.replace("/(app)/(tabs)/you");
        }}
      />
      <LocaleUiText style={styles.lead}>{t("proPack.categoryLead")}</LocaleUiText>
      <SmartHeadline title={t("proPack.pickCategory")} style={{ marginTop: 0 }} />
      <View style={styles.list}>
        {CATEGORIES.map((cat, index) => (
          <Pressable
            key={cat}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.88 }]}
            onPress={() =>
              router.push({
                pathname: "/(app)/professional-pack/matters",
                params: {
                  category: cat,
                  ...(fromPicker === "1" ? { fromPicker: "1" } : {}),
                },
              })
            }
          >
            <LocaleUiText style={styles.rowText}>
              {index + 1}. {t(`proPack.categories.${cat}`)}
            </LocaleUiText>
            <LocaleUiText style={styles.rowSub}>{t(`proPack.categories.${cat}Sub`)}</LocaleUiText>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
