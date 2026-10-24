import React, { useCallback, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  SectionList,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Calendar, type DateData } from "react-native-calendars";

import { CalendarMapRecordRow } from "@/components/calendarMaps/CalendarMapRecordRow";
import { VyaaFlowIntro } from "@/components/calendarMaps/VyaaFlowIntro";
import {
  filterVyaaflowAgendaSections,
  vyaaflowVisibleMode,
  type VyaaflowAgendaFilter,
} from "@/components/calendarMaps/vyaaflowAgenda";
import { SwipeToDeleteRow } from "@/components/records/SwipeToDeleteRow";
import { useRecordDelete } from "@/hooks/useRecordDelete";
import { userDeleteFromCalendarRecord } from "@/services/records/deleteTargets";
import { SignatureHeroSurface } from "@/components/signature";
import { EmptyState, ErrorState, Header, LastRefreshedHint, Screen, SkeletonList, SkeletonLoadingPanel, LocaleUiText } from "@/components/ui";
import { useCalendarMapsData } from "@/hooks/useCalendarMapsData";
import { useVyaaflowCopy } from "@/content/vyaaflow/useVyaaflowCopy";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import type { CalendarMapRecord, CalendarMarkedDots } from "@/services/calendarMaps";
import { navigateToCalendarMapRecord } from "@/services/calendarMaps/calendarMapsRouting";
import { dayKey, formatEntryDate } from "@/utils/date";
import {
  radius,
  spacing,
  typography,
  useThemedStyles,
  useTheme,
  useThemeColors,
  executiveCardDepth,
} from "@/theme";
import { calendarMarkerDotColors } from "@/theme/categoryAccentResolver";
import { childScrollListEndGap } from "@/layout/tabBarMetrics";

const AGENDA_FILTERS: VyaaflowAgendaFilter[] = ["all", "business", "statutory"];

export default function CalendarMapsTab() {
  const t = useT();
  const vyaaflowCopy = useVyaaflowCopy();
  const router = useRouter();
  const { mode: requestedMode } = useLocalSearchParams<{ mode?: string | string[] }>();
  const visibleMode = vyaaflowVisibleMode(requestedMode);
  const { user } = useAuth();
  const colors = useThemeColors();
  const { resolvedMode } = useTheme();
  const [selectedDate, setSelectedDate] = useState(() => dayKey(Date.now()));
  const [visibleMonth, setVisibleMonth] = useState(selectedDate);
  const [agendaFilter, setAgendaFilter] = useState<VyaaflowAgendaFilter>("all");

  const {
    loading,
    refreshing,
    error,
    reload,
    refresh,
    marked,
    dayView,
  } = useCalendarMapsData(user?.uid ?? null, selectedDate, visibleMonth);

  const { refreshNote, refreshControl } = useAppRefresh({
    onReload: refresh,
    externalRefreshing: refreshing,
  });
  const { requestDelete, isDeleting } = useRecordDelete(user?.uid ?? null);

  useFocusEffect(
    useCallback(() => {
      void reload("mount");
    }, [reload])
  );

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      root: { flex: 1, minHeight: 0 },
      agendaList: { flex: 1, minHeight: 0 },
      agendaContent: { paddingBottom: childScrollListEndGap() },
      headerWrap: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.md,
      },
      calendarCard: {
        marginHorizontal: spacing.lg,
        marginBottom: spacing.lg,
        overflow: "hidden",
        paddingBottom: spacing.xs,
        ...executiveCardDepth(resolvedMode === "dark", c, 2),
      },
      legendRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.lg,
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.md,
      },
      legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
      legendDot: { width: 8, height: 8, borderRadius: 4 },
      legendText: { ...typography.caption, color: c.textMuted },
      filterRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.lg,
      },
      filterChip: {
        minHeight: 44,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        backgroundColor: c.surfaceMuted,
        alignItems: "center",
        justifyContent: "center",
      },
      filterChipOn: {
        borderColor: c.primary,
        backgroundColor: c.primaryLight,
      },
      filterText: { ...typography.captionStrong, color: c.textMuted },
      filterTextOn: { color: c.primaryDark },
      dateTitle: {
        ...typography.titleSm,
        color: c.text,
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.md,
      },
      sectionHeader: {
        fontFamily: typography.titleLg.fontFamily,
        fontSize: typography.titleLg.fontSize,
        fontWeight: typography.titleLg.fontWeight,
        color: c.text,
        paddingHorizontal: spacing.lg,
        marginTop: spacing.xl,
        marginBottom: spacing.md,
      },
      sectionHeaderFirst: {
        marginTop: spacing.md,
      },
      rowGap: { marginBottom: spacing.md, paddingHorizontal: spacing.lg },
      emptyBlock: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.xl,
        gap: spacing.lg,
      },
    })
  );

  const markedDates = useMemo(() => {
    const dots = calendarMarkerDotColors(resolvedMode);
    const out: Record<string, object> = {};
    for (const [key, dayDots] of Object.entries(marked) as [string, CalendarMarkedDots][]) {
      const dotList: { color: string; key: string }[] = [];
      if (dayDots.entry) dotList.push({ color: dots.entry, key: "entry" });
      if (dayDots.followUp) dotList.push({ color: dots.followUp, key: "due" });
      if (dayDots.pack) dotList.push({ color: dots.pack, key: "pack" });
      if (dayDots.statutory) dotList.push({ color: dots.statutory, key: "statutory" });
      out[key] = { marked: true, dots: dotList };
    }
    out[selectedDate] = {
      ...(out[selectedDate] ?? {}),
      selected: true,
      selectedColor: colors.primary,
    };
    return out;
  }, [marked, selectedDate, colors.primary, resolvedMode]);

  const selectedDateLabel = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map((s) => parseInt(s, 10));
    return formatEntryDate(new Date(y, m - 1, d).getTime());
  }, [selectedDate]);

  const openRecord = useCallback(
    (record: CalendarMapRecord) => {
      navigateToCalendarMapRecord(router, record);
    },
    [router]
  );

  const openStatutoryReference = useCallback(() => {
    router.push({ pathname: "/statutory", params: { from: "calendar" } });
  }, [router]);

  const filterLabel = useCallback(
    (filter: VyaaflowAgendaFilter) => {
      if (filter === "business") return vyaaflowCopy.filters.myBusiness;
      if (filter === "statutory") return vyaaflowCopy.filters.statutory;
      return vyaaflowCopy.filters.all;
    },
    [vyaaflowCopy.filters]
  );

  const sections = useMemo(
    () =>
      filterVyaaflowAgendaSections(dayView.sections, agendaFilter).map((s) => ({
        title: t(`calendarMaps.sections.${s.categoryKey}`),
        categoryKey: s.categoryKey,
        data: s.data,
      })),
    [dayView.sections, agendaFilter, t]
  );

  const calendarListHeader = useMemo(
    () => (
      <View>
        <View style={styles.calendarCard}>
          <Calendar
            current={visibleMonth}
            onMonthChange={(month: DateData) => setVisibleMonth(month.dateString)}
            onDayPress={(d: DateData) => setSelectedDate(d.dateString)}
            markingType="multi-dot"
            markedDates={markedDates}
            theme={{
              backgroundColor: colors.surface,
              calendarBackground: colors.surface,
              textSectionTitleColor: colors.textMuted,
              selectedDayBackgroundColor: colors.primary,
              selectedDayTextColor: colors.primaryOn,
              todayTextColor: colors.primary,
              dayTextColor: colors.text,
              textDisabledColor: colors.textSubtle,
              arrowColor: colors.primary,
              monthTextColor: colors.text,
              textDayFontWeight: "500",
              textMonthFontWeight: "700",
              textDayHeaderFontWeight: "600",
            }}
          />
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <LocaleUiText style={styles.legendText}>{t("calendarMaps.legendRecord")}</LocaleUiText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
            <LocaleUiText style={styles.legendText}>{t("calendarMaps.legendDue")}</LocaleUiText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.textMuted }]} />
            <LocaleUiText style={styles.legendText}>{t("calendarMaps.legendStatutory")}</LocaleUiText>
          </View>
        </View>

        <View style={styles.filterRow} accessibilityRole="radiogroup">
          {AGENDA_FILTERS.map((filter) => {
            const selected = agendaFilter === filter;
            const label = filterLabel(filter);
            return (
              <Pressable
                key={filter}
                onPress={() => setAgendaFilter(filter)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={label}
                style={[styles.filterChip, selected && styles.filterChipOn]}
              >
                <LocaleUiText style={[styles.filterText, selected && styles.filterTextOn]}>
                  {label}
                </LocaleUiText>
              </Pressable>
            );
          })}
        </View>

        <LocaleUiText style={styles.dateTitle}>
          {t("calendar.entriesOn", { date: selectedDateLabel })}
        </LocaleUiText>

        {error ? (
          <ErrorState
            message={t("calendarMaps.loadError")}
            onRetry={() => void reload("refresh")}
            retryLabel={t("common.retry")}
          />
        ) : null}
        {loading && dayView.isEmpty ? (
          <SkeletonLoadingPanel loading slowMessage={t("skeleton.stillLoading")}>
            <SkeletonList count={4} />
          </SkeletonLoadingPanel>
        ) : null}
      </View>
    ),
    [
      styles,
      selectedDate,
      markedDates,
      colors,
      t,
      selectedDateLabel,
      error,
      loading,
      dayView.isEmpty,
      reload,
      agendaFilter,
      filterLabel,
    ]
  );

  const calendarBody = useMemo(() => {
    if (!loading && sections.length === 0) {
      return (
        <ScrollView
          style={styles.agendaList}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.agendaContent}
          refreshControl={refreshControl}
        >
          {calendarListHeader}
          <View style={styles.emptyBlock}>
            <EmptyState
              title={t("calendarMaps.dayEmptyTitle")}
              message={
                agendaFilter === "statutory"
                  ? t("statutory.calendar.markerSubtitle")
                  : t("calendarMaps.dayEmptyMessage")
              }
            />
          </View>
        </ScrollView>
      );
    }

    return (
      <SectionList
        style={styles.agendaList}
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={calendarListHeader}
        refreshControl={refreshControl}
        renderSectionHeader={({ section: { title } }) => {
          const isFirst = sections[0]?.title === title;
          return (
            <LocaleUiText
              style={[styles.sectionHeader, isFirst && styles.sectionHeaderFirst]}
            >
              {title}
            </LocaleUiText>
          );
        }}
        renderItem={({ item }) => {
          const deleteReq = userDeleteFromCalendarRecord(item);
          const row = (
            <CalendarMapRecordRow
              record={item}
              typeLabel={t(item.categoryLabelKey)}
              onPress={() => openRecord(item)}
            />
          );
          return (
            <View style={styles.rowGap}>
              {deleteReq ? (
                <SwipeToDeleteRow
                  rowKey={`cal-${item.id}`}
                  recordId={deleteReq.recordId}
                  entityType={deleteReq.entityType}
                  title={deleteReq.title}
                  onDeletePress={() => requestDelete(deleteReq, () => void refresh())}
                  deleteInProgress={isDeleting(deleteReq)}
                >
                  {row}
                </SwipeToDeleteRow>
              ) : (
                row
              )}
            </View>
          );
        }}
        stickySectionHeadersEnabled={false}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={Platform.OS === "android"}
        contentContainerStyle={styles.agendaContent}
        showsVerticalScrollIndicator={false}
      />
    );
  }, [
    loading,
    sections,
    calendarListHeader,
    styles,
    t,
    openRecord,
    requestDelete,
    refresh,
    refreshControl,
    isDeleting,
    agendaFilter,
  ]);

  return (
    <Screen padded={false} dismissKeyboardOnTap={false} tabBarInset childScrollOwner>
      <View key={visibleMode} style={styles.root}>
        <View style={styles.headerWrap}>
          <SignatureHeroSurface variant="identity" style={{ marginBottom: spacing.sm }} padded={false}>
            <View style={{ padding: spacing.lg, paddingBottom: spacing.md }}>
              <Header title={vyaaflowCopy.screenTitle} subtitle={vyaaflowCopy.intro} />
              <VyaaFlowIntro onOpenStatutoryReference={openStatutoryReference} />
              <LastRefreshedHint message={refreshNote} />
            </View>
          </SignatureHeroSurface>
        </View>

        {calendarBody}
      </View>
    </Screen>
  );
}
