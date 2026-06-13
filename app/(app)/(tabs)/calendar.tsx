import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Platform,
  SectionList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Calendar, type DateData } from "react-native-calendars";

import { CalendarMapRecordRow } from "@/components/calendarMaps/CalendarMapRecordRow";
import { SwipeToDeleteRow } from "@/components/records/SwipeToDeleteRow";
import { useRecordDelete } from "@/hooks/useRecordDelete";
import { userDeleteFromCalendarRecord } from "@/services/records/deleteTargets";
import { CalendarMapsModeTransition } from "@/components/calendarMaps/CalendarMapsModeTransition";
import {
  CalendarMapsModeSwitch,
  type CalendarMapsMode,
} from "@/components/calendarMaps/CalendarMapsModeSwitch";
import { DeferredCalendarMapsMapPanel } from "@/components/calendarMaps/DeferredCalendarMapsMapPanel";
import { SignatureHeroSurface } from "@/components/signature";
import { EmptyState, ErrorState, Header, LastRefreshedHint, Screen, SkeletonList, SkeletonLoadingPanel, LocaleUiText } from "@/components/ui";
import { useCalendarMapsData } from "@/hooks/useCalendarMapsData";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { useAuth } from "@/state/auth";
import { scheduleDeferredIndiaPincodeWarm } from "@/services/location/pincodeOfflineLookup";
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
import { useTabBarMetrics } from "@/layout/tabBar";

export default function CalendarMapsTab() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const colors = useThemeColors();
  const { resolvedMode } = useTheme();
  const tabBar = useTabBarMetrics();
  const [mode, setMode] = useState<CalendarMapsMode>("calendar");
  const [mapEverOpened, setMapEverOpened] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => dayKey(Date.now()));

  useEffect(() => {
    if (mode === "map") setMapEverOpened(true);
  }, [mode]);

  useEffect(() => {
    if (user?.uid) scheduleDeferredIndiaPincodeWarm(2500);
  }, [user?.uid]);

  const {
    loading,
    refreshing,
    markersLoading,
    mapStats,
    error,
    reload,
    refresh,
    marked,
    dayView,
    mapClusters,
    locationPermission,
    refreshPermission,
  } = useCalendarMapsData(user?.uid ?? null, selectedDate, {
    mapActive: mode === "map",
  });

  const { refreshNote, onRefresh, refreshControl } = useAppRefresh({
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
      root: { flex: 1 },
      modeSwitchWrap: {
        zIndex: 10,
        elevation: 10,
      },
      headerWrap: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.md,
      },
      lead: {
        ...typography.body,
        color: c.textMuted,
        marginTop: spacing.sm,
        lineHeight: 22,
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
        marginBottom: spacing.lg,
      },
      legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
      legendDot: { width: 8, height: 8, borderRadius: 4 },
      legendText: { ...typography.caption, color: c.textMuted },
      dateTitle: {
        ...typography.titleSm,
        color: c.text,
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.md,
      },
      sectionHeader: {
        ...typography.titleLg,
        color: c.text,
        lineHeight: 30,
        paddingHorizontal: spacing.lg,
        marginTop: spacing.xl,
        marginBottom: spacing.md,
      },
      sectionHeaderFirst: {
        marginTop: spacing.md,
      },
      rowGap: { marginBottom: spacing.md, paddingHorizontal: spacing.lg },
      listFooter: { height: spacing.md },
      emptyBlock: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.xl,
        gap: spacing.lg,
      },
      errorText: {
        ...typography.body,
        color: c.danger,
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.md,
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

  const sections = useMemo(
    () =>
      dayView.sections.map((s) => ({
        title: t(`calendarMaps.sections.${s.categoryKey}`),
        data: s.data,
      })),
    [dayView.sections, t]
  );

  const calendarListHeader = useMemo(
    () => (
      <View>
        <View style={styles.calendarCard}>
          <Calendar
            current={selectedDate}
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
    ]
  );

  const calendarBody = useMemo(() => {
    if (!loading && dayView.isEmpty) {
      return (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: tabBar.contentPaddingBottom }}
          refreshControl={refreshControl}
        >
          {calendarListHeader}
          <View style={styles.emptyBlock}>
            <EmptyState
              title={t("calendarMaps.dayEmptyTitle")}
              message={t("calendarMaps.dayEmptyMessage")}
            />
          </View>
        </ScrollView>
      );
    }

    return (
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={calendarListHeader}
        ListFooterComponent={<View style={styles.listFooter} />}
        refreshControl={refreshControl}
        renderSectionHeader={({ section: { title } }) => {
          const isFirst = sections[0]?.title === title;
          return (
            <Text
              style={[styles.sectionHeader, isFirst && styles.sectionHeaderFirst]}
            >
              {title}
            </Text>
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
        contentContainerStyle={{ paddingBottom: tabBar.contentPaddingBottom }}
        showsVerticalScrollIndicator={false}
      />
    );
  }, [
    loading,
    dayView.isEmpty,
    sections,
    calendarListHeader,
    styles,
    tabBar.contentPaddingBottom,
    t,
    openRecord,
    requestDelete,
    refresh,
    refreshControl,
    refreshNote,
    isDeleting,
  ]);

  return (
    <Screen padded={false} dismissKeyboardOnTap={false} tabBarInset>
      <View style={styles.root}>
        <View style={styles.headerWrap}>
          <SignatureHeroSurface variant="identity" style={{ marginBottom: spacing.sm }} padded={false}>
            <View style={{ padding: spacing.lg, paddingBottom: spacing.md }}>
              <Header
                title={t("calendarMaps.screenTitle")}
                subtitle={t("calendarMaps.screenSubtitle")}
              />
              <LocaleUiText style={styles.lead}>{t("calendarMaps.screenLead")}</LocaleUiText>
              <LastRefreshedHint message={refreshNote} />
            </View>
          </SignatureHeroSurface>
        </View>

        <View style={styles.modeSwitchWrap}>
          <CalendarMapsModeSwitch
            mode={mode}
            onChange={setMode}
            calendarLabel={t("calendarMaps.modeCalendar")}
            mapLabel={t("calendarMaps.modeMap")}
          />
        </View>

        <CalendarMapsModeTransition
          mode={mode}
          calendar={calendarBody}
          map={
            mapEverOpened ? (
              <DeferredCalendarMapsMapPanel
                clusters={mapClusters}
                loading={loading}
                markersLoading={markersLoading}
                mapStats={mapStats}
                locationPermission={locationPermission}
                onRefreshPermission={() => void refreshPermission()}
                onOpenRecord={openRecord}
              />
            ) : null
          }
        />
      </View>
    </Screen>
  );
}
