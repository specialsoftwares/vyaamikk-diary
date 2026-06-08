import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Platform, Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AtAGlancePeriodHeader } from "@/components/dashboard/AtAGlancePeriodHeader";
import { AtAGlanceWeekRangeControl } from "@/components/dashboard/AtAGlanceWeekRangeControl";
import { AtAGlanceRow } from "@/components/dashboard/AtAGlanceRow";
import { SwipeToDeleteRow } from "@/components/records/SwipeToDeleteRow";
import { PremiumNewRecordButton } from "@/components/you/PremiumNewRecordButton";
import { useRecordDelete } from "@/hooks/useRecordDelete";
import { userDeleteFromAtAGlance } from "@/services/records/deleteTargets";
import { EmptyState, ErrorState, Header, Screen, SkeletonList, SkeletonLoadingPanel, LocaleUiText } from "@/components/ui";
import { useAtAGlanceDetail } from "@/hooks/useAtAGlanceDetail";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { navigateToAtAGlanceItem } from "@/services/dashboard/atAGlanceRouting";
import type {
  AtAGlanceCustomRange,
  AtAGlanceItem,
  AtAGlanceViewKind,
} from "@/services/dashboard";
import { formatShortDate } from "@/utils/date";
import { spacing, typography, useThemedStyles } from "@/theme";

const VIEW_KINDS: AtAGlanceViewKind[] = ["today", "this_week", "upcoming"];

function parseView(raw: string | string[] | undefined): AtAGlanceViewKind {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "today" || v === "this-week") return v === "today" ? "today" : "this_week";
  if (v === "this_week") return "this_week";
  if (v === "upcoming") return "upcoming";
  return "today";
}

export default function AtAGlanceDetailScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { view: viewParam } = useLocalSearchParams<{ view?: string }>();
  const view = parseView(viewParam);
  const { user } = useAuth();
  const [customWeekRange, setCustomWeekRange] = useState<AtAGlanceCustomRange | null>(
    null
  );
  const { model, loading, error, reload } = useAtAGlanceDetail(
    user?.uid ?? null,
    view,
    customWeekRange
  );
  const { requestDelete, isDeleting } = useRecordDelete(user?.uid ?? null);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      headerWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
      sectionHeaderWrap: {
        paddingHorizontal: spacing.lg,
      },
      sectionHeader: {
        ...typography.captionStrong,
        color: c.textMuted,
        marginTop: spacing.md,
        marginBottom: spacing.sm,
      },
      /** This week / Upcoming — same scale as You greeting */
      sectionHeaderLarge: {
        ...typography.titleLg,
        color: c.text,
        lineHeight: 30,
        marginTop: spacing.xl,
        marginBottom: spacing.md,
      },
      rowGap: { marginBottom: spacing.sm },
      listContent: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xxl + insets.bottom,
      },
      emptyAction: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
      sectionFooterWrap: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.md,
      },
      sectionFooterLink: { ...typography.captionStrong, color: c.primary },
    })
  );

  const sections = useMemo(
    () =>
      model.sections.map((s) => ({
        title: t(`atAGlance.sections.${view}.${s.sectionKey}`),
        data: s.data,
        totalCount: s.totalCount,
        sectionKey: s.sectionKey,
      })),
    [model.sections, t, view]
  );

  const viewAllRecords = useCallback(() => {
    if (view === "upcoming") {
      router.push({ pathname: "/(app)/diary", params: { filter: "upcoming" } });
    } else {
      router.push("/(app)/diary");
    }
  }, [router, view]);

  const openComposer = useCallback(() => {
    router.push("/(app)/(tabs)/you");
  }, [router]);

  const useLargeSectionHeaders = view === "this_week" || view === "upcoming";

  const renderItem = useCallback(
    ({ item }: { item: AtAGlanceItem }) => {
      const dateLine =
        view === "upcoming" && item.urgency
          ? t(`atAGlance.urgency.${item.urgency}`, {
              date: formatShortDate(item.dateMs),
            })
          : formatShortDate(item.dateMs);
      const deleteReq = userDeleteFromAtAGlance(item);
      const row = (
        <AtAGlanceRow
          item={item}
          typeLabel={t(item.typeLabelKey)}
          dateLine={dateLine}
          statusChip={item.statusChipKey ? t(item.statusChipKey) : undefined}
          onPress={() => navigateToAtAGlanceItem(router, item)}
        />
      );
      return (
        <View style={styles.rowGap}>
          {deleteReq ? (
            <SwipeToDeleteRow
              rowKey={`agl-${item.id}`}
              recordId={deleteReq.recordId}
              entityType={deleteReq.entityType}
              title={deleteReq.title}
              onDeletePress={() => requestDelete(deleteReq, reload)}
              deleteInProgress={isDeleting(deleteReq)}
            >
              {row}
            </SwipeToDeleteRow>
          ) : (
            row
          )}
        </View>
      );
    },
    [router, styles.rowGap, t, view, requestDelete, reload, isDeleting]
  );

  if (!VIEW_KINDS.includes(view)) {
    return null;
  }

  return (
    <Screen padded={false} dismissKeyboardOnTap={false}>
      <View style={styles.headerWrap}>
        <Header
          title={t(`atAGlance.${view}.title`)}
          subtitle={t(`atAGlance.${view}.count`, { count: model.totalItems })}
          showBack
          backFrom="you"
        />
        <AtAGlancePeriodHeader view={view} customWeekRange={customWeekRange} />
        {view === "this_week" ? (
          <AtAGlanceWeekRangeControl
            appliedRange={customWeekRange}
            onApply={setCustomWeekRange}
            onResetDefault={() => setCustomWeekRange(null)}
          />
        ) : null}
      </View>

      {loading && model.isEmpty ? (
        <SkeletonLoadingPanel
          loading
          slowMessage={t("skeleton.stillLoading")}
          style={styles.listContent}
        >
          <SkeletonList count={6} />
        </SkeletonLoadingPanel>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : model.isEmpty ? (
        <View style={styles.emptyAction}>
          <EmptyState
            title={t(`atAGlance.${view}.emptyTitle`)}
            message={
              view === "this_week" && customWeekRange
                ? t("atAGlance.customRange.emptyMessage")
                : t(`atAGlance.${view}.emptyMessage`)
            }
          />
          <PremiumNewRecordButton
            label={t("you.addEntryBar")}
            onPress={openComposer}
            accessibilityLabel={t("you.fabLabel")}
            style={{ marginTop: spacing.lg }}
          />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeaderWrap}>
              <Text
                style={
                  useLargeSectionHeaders ? styles.sectionHeaderLarge : styles.sectionHeader
                }
                accessibilityRole="header"
              >
                {title}
              </Text>
            </View>
          )}
          renderSectionFooter={({ section }) => {
            const total = section.totalCount ?? section.data.length;
            if (total <= section.data.length) return null;
            return (
              <View style={styles.sectionFooterWrap}>
                <Pressable onPress={viewAllRecords} accessibilityRole="button">
                  <LocaleUiText style={styles.sectionFooterLink}>
                    {t("atAGlance.viewAllInSection", { count: total })}
                  </LocaleUiText>
                </Pressable>
              </View>
            );
          }}
          stickySectionHeadersEnabled={false}
          initialNumToRender={14}
          maxToRenderPerBatch={12}
          windowSize={8}
          removeClippedSubviews={Platform.OS === "android"}
          contentContainerStyle={styles.listContent}
        />
      )}
    </Screen>
  );
}
