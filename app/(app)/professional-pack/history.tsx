import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { SwipeToDeleteRow } from "@/components/records/SwipeToDeleteRow";
import { EmptyState, Header, Screen, SmartHeadline, TextField, LocaleUiText } from "@/components/ui";
import { useRecordDelete } from "@/hooks/useRecordDelete";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";
import { formatEntryDate } from "@/utils/date";
import { getProfessionalPackRepository } from "@/services/professionalPack";
import {
  categoryLabelKey,
  matterLabelKey,
  statusLabelKey,
} from "@/utils/professionalPack/display";

export default function ProfessionalPackHistoryScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const [packs, setPacks] = useState<ProfessionalServicePack[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const { requestDelete, isDeleting } = useRecordDelete(user?.uid ?? null);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      search: { marginBottom: spacing.md },
      row: {
        paddingVertical: spacing.md,
        gap: 4,
        borderBottomWidth: 1,
        borderBottomColor: c.divider,
      },
      title: { ...typography.bodyStrong, color: c.text },
      meta: { ...typography.caption, color: c.textMuted },
      sub: { ...typography.caption, color: c.textSubtle },
    })
  );

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const list = await getProfessionalPackRepository().list(user.uid, {
        search,
        limit: 200,
      });
      setPacks(list);
    } finally {
      setLoading(false);
    }
  }, [user, search]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Header title={t("proPack.historyTitle")} showBack backFrom="you" />
        <SmartHeadline title={t("proPack.historySubtitle")} style={{ marginTop: 0 }} />
        <TextField
          containerStyle={styles.search}
          placeholder={t("proPack.searchPlaceholder")}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <FlatList
        data={packs}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl }}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              title={t("proPack.historyEmptyTitle")}
              message={t("proPack.historyEmptyMessage")}
              actionLabel={t("proPack.title")}
              onAction={() => router.push("/(app)/professional-pack")}
            />
          )
        }
        renderItem={({ item, index }) => {
          const req = {
            entityType: "professional_pack" as const,
            recordId: item.id,
            title: item.title,
            confirmTier: "record" as const,
          };
          const row = (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: "/(app)/professional-pack/[id]",
                  params: { id: item.id },
                })
              }
            >
            <Text style={styles.title}>
              {index + 1}. {item.title}
            </Text>
            <LocaleUiText style={styles.meta}>
              {t(categoryLabelKey(item.professionalCategory))} ·{" "}
              {t(matterLabelKey(item.professionalCategory, item.matterType))} ·{" "}
              {t(statusLabelKey(item.status))}
            </LocaleUiText>
            <Text style={styles.sub}>
              {formatEntryDate(item.matterDate)}
              {item.dueDate ? ` · Due ${formatEntryDate(item.dueDate)}` : ""}
            </Text>
          </Pressable>
          );
          return (
            <SwipeToDeleteRow
              rowKey={`pack-${item.id}`}
              recordId={item.id}
              entityType="professional_pack"
              title={item.title}
              onDeletePress={() => requestDelete(req, load)}
              deleteInProgress={isDeleting(req)}
            >
              {row}
            </SwipeToDeleteRow>
          );
        }}
      />
    </Screen>
  );
}
