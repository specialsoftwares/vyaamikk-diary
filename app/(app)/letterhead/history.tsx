/**
 * Letterhead documents history.
 *
 * Lists every LetterheadDocument record this user has saved, sorted
 * newest first. Tapping a row opens a small detail sheet (inline) that
 * lets the user:
 *   • Regenerate + share the PDF from the saved input (uses the CURRENT
 *     letterhead config — if the template was replaced after this doc
 *     was created, we warn the user inline).
 *   • Delete the saved record.
 *
 * No screen-local data — everything goes through
 * `getLetterheadDocumentRepository()`.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { SwipeToDeleteRow } from "@/components/records/SwipeToDeleteRow";
import { useRecordDelete } from "@/hooks/useRecordDelete";
import { Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Header,
  LastRefreshedHint,
  Screen,
  SkeletonLetterheadCard,
  SkeletonList,
  SkeletonLoadingPanel, LocaleUiText } from "@/components/ui";
import { useAuth } from "@/state/auth";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { useI18n, useT } from "@/i18n";
import {
  radius,
  spacing,
  typography,
  useThemedStyles,
} from "@/theme";
import {
  getLetterheadDocumentRepository,
  getLetterheadRepository,
  type LetterheadConfig,
  type LetterheadDocument,
} from "@/services/letterhead";
import { pdfService } from "@/services/pdf/pdfService";
import { englishPdfT } from "@/i18n/englishPdfT";
import { buildLetterheadHtml } from "@/services/pdf/letterheadPdfService";
import { userFacingMessage } from "@/domain/errors";
import { dayKey, formatShortDate } from "@/utils/date";

export default function LetterheadHistoryScreen() {
  const t = useT();
  const { lang } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [docs, setDocs] = useState<LetterheadDocument[]>([]);
  const [config, setConfig] = useState<LetterheadConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { requestDelete, isDeleting } = useRecordDelete(user?.uid ?? null);

  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      lead: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md },
      banner: { marginBottom: spacing.md },
      listContent: { gap: spacing.md, paddingBottom: spacing.xxxl },
      row: { gap: spacing.xs },
      rowTitle: { ...typography.titleSm, color: colors.text },
      rowMeta: { ...typography.caption, color: colors.textMuted },
      rowSub: { ...typography.caption, color: colors.textSubtle, marginTop: spacing.xs },
      rowActions: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.sm,
        marginTop: spacing.sm,
      },
      templateWarn: {
        ...typography.caption,
        color: colors.warning,
        marginTop: spacing.xs,
      },
      pill: {
        alignSelf: "flex-start",
        backgroundColor: colors.primaryLight,
        paddingVertical: 2,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
      },
      pillText: { ...typography.micro, color: colors.primaryDark },
    })
  );

  const load = useCallback(
    async (mode: "mount" | "refresh" = "mount") => {
      if (!user) return;
      if (mode === "refresh" && hasLoadedOnceRef.current) {
        setRefreshing(true);
      } else if (!hasLoadedOnceRef.current) {
        setLoading(true);
      }
      setError(null);
      try {
        const [list, cfg] = await Promise.all([
          getLetterheadDocumentRepository().list(user.uid),
          getLetterheadRepository().get(user.uid),
        ]);
        setDocs(list);
        setConfig(cfg);
        hasLoadedOnceRef.current = true;
      } catch (e) {
        setError(userFacingMessage(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  const { refreshNote, onRefresh, refreshControl } = useAppRefresh({
    onReload: () => load("refresh"),
    externalRefreshing: refreshing,
  });

  useFocusEffect(
    useCallback(() => {
      void load("mount");
    }, [load])
  );

  const onRegenerate = useCallback(async (item: LetterheadDocument) => {
    if (!user || !config) {
      setActionError(t("letterhead.gateMissingMessage"));
      return;
    }
    if (!config.imageDataUri?.trim()) {
      router.replace("/(app)/letterhead/setup");
      return;
    }
    setActionError(null);
    setBusyId(item.id);
    try {
      const { html } = await buildLetterheadHtml({
        config,
        doc: item.input,
        locale: lang === "hi" ? "hi-IN" : "en-IN",
        labels: {
          subject: englishPdfT()("letterhead.labels.subject"),
          date: englishPdfT()("letterhead.labels.date"),
          reference: englishPdfT()("letterhead.labels.reference"),
          to: englishPdfT()("letterhead.labels.to"),
        },
      });
      const fileNameHint = t("letterhead.fileNameHint", {
        date: dayKey(item.input.date),
      });
      const pdf = await pdfService.generate({ html, fileNameHint });
      try {
        await getLetterheadDocumentRepository().update(user.uid, item.id, {
          pdfUri: pdf.uri,
        });
      } catch {
        // non-fatal
      }
      try {
        await pdfService.share(pdf);
      } catch {
        // share dismissed
      }
    } catch (e) {
      setActionError(userFacingMessage(e) || t("letterhead.createGenerateFailed"));
    } finally {
      setBusyId(null);
    }
  }, [user, config, lang, t, router]);

  const onEdit = useCallback(
    (item: LetterheadDocument) => {
      router.push({
        pathname: "/(app)/letterhead/create",
        params: { editDocId: item.id },
      });
    },
    [router]
  );

  const onDelete = useCallback(
    (item: LetterheadDocument) => {
      const req = {
        entityType: "letterhead_document" as const,
        recordId: item.id,
        title: item.title,
        confirmTier: "record" as const,
      };
      requestDelete(req, async () => {
        setActionError(null);
        await load("mount");
      });
    },
    [requestDelete, load]
  );

  const renderItem = useCallback(
    ({ item }: { item: LetterheadDocument }) => {
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
          onDeletePress={() => onDelete(item)}
          deleteInProgress={isDeleting(req)}
        >
          <LetterheadHistoryRow
            item={item}
            config={config}
            styles={styles}
            busyId={busyId}
            onRegenerate={onRegenerate}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </SwipeToDeleteRow>
      );
    },
    [config, styles, busyId, onRegenerate, onEdit, onDelete, isDeleting]
  );

  const listPadding = useMemo(
    () => [
      { paddingHorizontal: spacing.lg },
      styles.listContent,
      { paddingBottom: insets.bottom + spacing.xxl },
    ],
    [styles.listContent, insets.bottom]
  );

  return (
    <Screen padded={false} dismissKeyboardOnTap={false}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Header
          title={t("letterhead.historyTitle")}
          subtitle={t("letterhead.historySubtitle")}
          showBack
          backFrom="letterhead"
        />
        {actionError ? (
          <View style={styles.banner}>
            <Banner tone="danger" message={actionError} />
          </View>
        ) : null}
        <LastRefreshedHint message={refreshNote} />
      </View>

      {loading && docs.length === 0 ? (
        <SkeletonLoadingPanel loading slowMessage={t("skeleton.stillLoading")}>
          <SkeletonList count={5} Item={SkeletonLetterheadCard} />
        </SkeletonLoadingPanel>
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load("mount")} />
      ) : (
        <FlatList
          data={docs}
          keyExtractor={(d) => d.id}
          renderItem={renderItem}
          refreshControl={refreshControl}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={Platform.OS === "android"}
          contentContainerStyle={listPadding}
          ListEmptyComponent={
            <EmptyState
              title={t("letterhead.historyEmptyTitle")}
              message={t("letterhead.historyEmptyMessage")}
              actionLabel={t("letterhead.gateCreate")}
              onAction={() => router.push("/(app)/letterhead/create")}
            />
          }
        />
      )}
    </Screen>
  );
}

type HistoryRowStyles = {
  row: object;
  pill: object;
  pillText: object;
  rowTitle: object;
  rowMeta: object;
  rowSub: object;
  templateWarn: object;
  rowActions: object;
};

function LetterheadHistoryRow({
  item,
  config,
  styles,
  busyId,
  onRegenerate,
  onEdit,
  onDelete,
}: {
  item: LetterheadDocument;
  config: LetterheadConfig | null;
  styles: HistoryRowStyles;
  busyId: string | null;
  onRegenerate: (item: LetterheadDocument) => void;
  onEdit: (item: LetterheadDocument) => void;
  onDelete: (item: LetterheadDocument) => void;
}) {
  const t = useT();
  const templateChanged =
    config != null &&
    item.templateRefUpdatedAt != null &&
    config.updatedAt !== item.templateRefUpdatedAt;
  const version = item.version ?? 1;
  const createdAt = item.firstGeneratedAt ?? item.createdAt;
  return (
      <Card style={styles.row} elevated={false}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{formatShortDate(item.input.date)}</Text>
        </View>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {item.input.subject ? (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {item.input.subject}
          </Text>
        ) : null}
        <Text style={styles.rowSub}>
          {version > 1
            ? t("letterhead.historyVersionMeta", {
                version,
                created: formatShortDate(createdAt),
                modified: formatShortDate(item.lastEditedAt ?? item.updatedAt),
              })
            : t("letterhead.historyCreatedMeta", { created: formatShortDate(createdAt) })}
        </Text>
        {templateChanged ? (
          <LocaleUiText style={styles.templateWarn}>{t("letterhead.historyTemplateChanged")}</LocaleUiText>
        ) : null}
        <View style={styles.rowActions}>
          <Button
            label={t("letterhead.historyRegenerate")}
            size="md"
            fullWidth={false}
            variant="secondary"
            onPress={() => onRegenerate(item)}
            loading={busyId === item.id}
          />
          <Button
            label={t("common.edit")}
            size="md"
            fullWidth={false}
            variant="secondary"
            onPress={() => onEdit(item)}
            disabled={busyId === item.id}
          />
          <Button
            label={t("common.delete")}
            size="md"
            fullWidth={false}
            variant="ghost"
            onPress={() => onDelete(item)}
            disabled={busyId === item.id}
          />
        </View>
      </Card>
  );
}
