/**
 * Saved letters from before Letterhead creation was removed.
 * Lists owner records only. Does not create, edit, or generate a PDF.
 */
import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { SwipeToDeleteRow } from "@/components/records/SwipeToDeleteRow";
import { useRecordDelete } from "@/hooks/useRecordDelete";
import {
  Card,
  EmptyState,
  ErrorState,
  Header,
  Loader,
  LocaleUiText,
  Screen,
} from "@/components/ui";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";
import { getLetterheadDocumentRepository } from "@/services/letterhead/documentRepository";
import type { LetterheadDocument } from "@/services/letterhead/types";
import { userFacingMessage } from "@/domain/errors";
import { formatShortDate } from "@/utils/date";

export default function LegacyLetterheadHistoryScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const [docs, setDocs] = useState<LetterheadDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { requestDelete, isDeleting } = useRecordDelete(user?.uid ?? null);

  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      lead: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md },
      list: { flex: 1 },
      listContent: { gap: spacing.md, paddingBottom: spacing.xxxl },
      title: { ...typography.titleSm, color: colors.text },
      meta: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
    })
  );

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const list = await getLetterheadDocumentRepository().list(user.uid);
      setDocs(list);
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <Screen>
      <Header title={t("letterhead.legacyListTitle")} showBack backFrom="letterhead" />
      <LocaleUiText style={styles.lead}>{t("letterhead.legacyListLead")}</LocaleUiText>
      {loading ? <Loader fullscreen message={t("common.loading")} /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && !error ? (
        <FlatList
          data={docs}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              title={t("letterhead.legacyEmptyTitle")}
              message={t("letterhead.legacyEmptyMessage")}
            />
          }
          renderItem={({ item }) => {
            const req = {
              entityType: "letterhead_document" as const,
              recordId: item.id,
              title: item.title,
              confirmTier: "record" as const,
            };
            return (
              <SwipeToDeleteRow
                rowKey={`lh-${item.id}`}
                recordId={item.id}
                entityType="letterhead_document"
                title={item.title}
                onDeletePress={() => requestDelete(req, () => load())}
                deleteInProgress={isDeleting(req)}
              >
                <Card
                  onPress={() =>
                    router.push({
                      pathname: "/(app)/letterhead/create",
                      params: { documentId: item.id },
                    })
                  }
                >
                  <View>
                    <LocaleUiText style={styles.title}>{item.title || item.input.subject}</LocaleUiText>
                    <LocaleUiText style={styles.meta}>{formatShortDate(item.input.date)}</LocaleUiText>
                  </View>
                </Card>
              </SwipeToDeleteRow>
            );
          }}
        />
      ) : null}
    </Screen>
  );
}
