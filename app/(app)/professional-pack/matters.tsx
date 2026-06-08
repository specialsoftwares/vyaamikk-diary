import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Header, LocaleUiText, Screen, SmartHeadline } from "@/components/ui";
import type { ProfessionalCategory } from "@/domain/professionalPack";
import { creatableMattersForCategory } from "@/domain/professionalPackCreatable";
import { isProfessionalCategory } from "@/domain/professionalPackMatters";
import { useT } from "@/i18n";
import { requestComposerPickerReturn } from "@/navigation";
import { spacing, typography, useThemedStyles } from "@/theme";

export default function ProfessionalPackMattersScreen() {
  const t = useT();
  const router = useRouter();
  const { category: catParam, fromPicker } = useLocalSearchParams<{
    category: string;
    fromPicker?: string;
  }>();
  const category: ProfessionalCategory | null = isProfessionalCategory(catParam ?? "")
    ? (catParam as ProfessionalCategory)
    : null;

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      list: { gap: spacing.sm },
      row: {
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: 12,
        backgroundColor: c.surfaceMuted,
      },
      rowText: { ...typography.body, color: c.text },
    })
  );

  if (!category) {
    return (
      <Screen>
        <Header title={t("proPack.invalid")} showBack backFrom="you" />
      </Screen>
    );
  }

  const matters = creatableMattersForCategory(category);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (fromPicker === "1") {
      requestComposerPickerReturn("picker");
    }
    router.replace("/(app)/(tabs)/you");
  };

  return (
    <Screen scroll>
      <Header
        title={t(`proPack.categories.${category}`)}
        showBack
        backFrom="you"
        onBackPress={handleBack}
      />
      <SmartHeadline title={t("proPack.pickMatter")} subtitle={t("proPack.matterLead")} style={{ marginTop: 0 }} />
      <View style={styles.list}>
        {matters.map((m, index) => (
          <Pressable
            key={m.type}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.88 }]}
            onPress={() =>
              router.push({
                pathname: "/(app)/professional-pack/form",
                params: {
                  category,
                  matter: m.type,
                  ...(fromPicker === "1" ? { fromPicker: "1" } : {}),
                },
              })
            }
          >
            <LocaleUiText style={styles.rowText}>
              {index + 1}. {t(`proPack.matters.${m.labelKey}`)}
            </LocaleUiText>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
