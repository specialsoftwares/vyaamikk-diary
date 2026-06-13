import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";

import { creatableMattersForCategory } from "@/domain/professionalPackCreatable";

import { Banner, LastRefreshedHint, Screen, SmartHeadline } from "@/components/ui";
import { SyncStatusBanner } from "@/components/sync/SyncStatusBanner";
import { ComposerPickerSheet } from "@/components/composer/ComposerPickerSheet";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";
import { SwipeToDeleteRow } from "@/components/records/SwipeToDeleteRow";
import { useRecordDelete } from "@/hooks/useRecordDelete";
import { DashboardStatTile } from "@/components/you/DashboardStatTile";
import { PremiumNewRecordButton } from "@/components/you/PremiumNewRecordButton";
import { UserGreetingHeader } from "@/components/profile/UserGreetingHeader";
import { EntryRow } from "@/components/diary/EntryRow";
import { useAuth } from "@/state/auth";
import { useIsOnline } from "@/state/network";
import { useDiaryList } from "@/state/useDiaryList";
import {
  buildYouDashboardViewModel,
  YOU_DASHBOARD_ENTRY_LIMIT,
  YOU_LETTERHEAD_SCAN_CAP,
  YOU_PRO_PACK_SCAN_LIMIT,
} from "@/services/dashboard";
import { formDraftsRepository } from "@/repositories/formDraftsRepository";
import { executiveCardDepth, spacing, typography, useTheme, useThemedStyles, DASHBOARD_SECTION_GAP } from "@/theme";
import { formatEntryDate } from "@/utils/date";
import { matterLabelKey } from "@/utils/professionalPack/display";
import { useT } from "@/i18n";
import { consumeComposerPickerReturn, pickerReturnParamForType } from "@/navigation";
import type { BusinessEntryType } from "@/domain/businessEntry";
import { getLetterheadDocumentRepository } from "@/services/letterhead/documentRepository";
import type { LetterheadDocument } from "@/services/letterhead/types";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import { getProfessionalPackRepository } from "@/services/professionalPack";
import { useAppRefresh } from "@/hooks/useAppRefresh";

export default function YouTab() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const online = useIsOnline();
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      dashboard: { gap: DASHBOARD_SECTION_GAP },
      topCluster: { gap: spacing.md },
      heroWrap: {
        marginBottom: spacing.md,
      },
      topSearchWrap: {
        marginTop: spacing.sm,
      },
      topSyncWrap: {
        marginTop: spacing.xs,
      },
      topOfflineWrap: {
        marginTop: spacing.xs,
      },
      topDivider: {
        height: 1,
        backgroundColor: c.divider,
        opacity: 0.55,
        marginTop: spacing.md,
        marginBottom: spacing.xs,
      },
      banner: {},
      statsRow: {
        flexDirection: "row",
        gap: spacing.sm,
      },
      sectionLink: { ...typography.captionStrong, color: c.primary },
      list: { gap: spacing.sm },
      packRow: {
        ...executiveCardDepth(isDark, c, 3),
        paddingVertical: spacing.md + 2,
        paddingHorizontal: spacing.md + 2,
        gap: 4,
      },
      packTitle: { ...typography.bodyStrong, color: c.text },
      packMeta: { ...typography.caption, color: c.textMuted },
    })
  );

  const userId = user?.uid ?? null;
  const listOptions = useMemo(() => ({ limit: YOU_DASHBOARD_ENTRY_LIMIT }), []);
  const { entries, error, refresh } = useDiaryList(userId, listOptions);
  const { requestDelete, isDeleting } = useRecordDelete(userId);
  const [letterheadDocs, setLetterheadDocs] = useState<LetterheadDocument[]>([]);
  const [proPacks, setProPacks] = useState<ProfessionalServicePack[]>([]);
  const [activeDraftCount, setActiveDraftCount] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerWorkTeamExpanded, setPickerWorkTeamExpanded] = useState(false);
  const navigation = useNavigation();

  useFocusEffect(
    useCallback(() => {
      const mode = consumeComposerPickerReturn();
      if (mode === "work_team") {
        setPickerWorkTeamExpanded(true);
        setPickerOpen(true);
      } else if (mode === "picker") {
        setPickerWorkTeamExpanded(false);
        setPickerOpen(true);
      }
    }, [])
  );

  useEffect(() => {
    const parent = navigation.getParent();
    if (!pickerOpen) return;
    parent?.setOptions({ gestureEnabled: false });
    return () => parent?.setOptions({ gestureEnabled: true });
  }, [pickerOpen, navigation]);

  const fetchLetterheadDocs = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await getLetterheadDocumentRepository().list(userId);
      const withPdf = list
        .filter((d) => d.pdfUri || d.saved)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, YOU_LETTERHEAD_SCAN_CAP);
      setLetterheadDocs(withPdf);
    } catch {
      // non-fatal
    }
  }, [userId]);

  const loadProPacks = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await getProfessionalPackRepository().list(userId, {
        limit: YOU_PRO_PACK_SCAN_LIMIT,
      });
      setProPacks(list);
    } catch {
      setProPacks([]);
    }
  }, [userId]);

  const fetchDraftCount = useCallback(async () => {
    if (!userId) return;
    try {
      const count = await formDraftsRepository.countActiveUserDrafts(userId);
      setActiveDraftCount(count);
    } catch {
      setActiveDraftCount(0);
    }
  }, [userId]);

  const refreshDashboard = useCallback(async () => {
    if (!userId) return;
    await Promise.all([
      refresh(),
      fetchLetterheadDocs(),
      loadProPacks(),
      fetchDraftCount(),
    ]);
  }, [userId, refresh, fetchLetterheadDocs, loadProPacks, fetchDraftCount]);

  const { refreshing: pullRefreshing, refreshNote, onRefresh } = useAppRefresh({
    onReload: refreshDashboard,
  });

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      void refresh();
      void fetchLetterheadDocs();
      void loadProPacks();
      void fetchDraftCount();
    }, [userId, refresh, fetchLetterheadDocs, loadProPacks, fetchDraftCount])
  );

  const dashboard = useMemo(
    () => buildYouDashboardViewModel(entries, letterheadDocs, proPacks, activeDraftCount, t),
    [entries, letterheadDocs, proPacks, activeDraftCount, t]
  );
  const { visibility } = dashboard;

  const openEntry = useCallback(
    (id: string) => {
      router.push({ pathname: "/(app)/diary/[id]", params: { id, from: "you" } });
    },
    [router]
  );

  const onPickComposer = useCallback(
    (
      type:
        | BusinessEntryType
        | "professional_pack"
        | "purchase_order"
        | "customer_credit"
        | "material_movement",
      routesToLetterhead?: boolean,
      routesToProfessionalPack?: boolean,
      routesToPurchaseOrder?: boolean,
      routesToCustomerCredit?: boolean
    ) => {
      if (routesToCustomerCredit) {
        router.push({
          pathname: "/(app)/customer-credit/form",
          params: { fromPicker: "1" },
        });
        return;
      }
      if (routesToPurchaseOrder) {
        router.push({
          pathname: "/(app)/purchase-order/form",
          params: { fromPicker: "1" },
        });
        return;
      }
      if (routesToProfessionalPack) {
        const matters = creatableMattersForCategory("ca_tax");
        const matter = matters[0]?.type ?? "gst_return_support";
        router.push({
          pathname: "/(app)/professional-pack/form",
          params: { category: "ca_tax", matter, fromPicker: "1" },
        });
        return;
      }
      if (routesToLetterhead) {
        router.push({
          pathname: "/(app)/letterhead",
          params: { fromPicker: "1" },
        });
        return;
      }
      if (type === "material_movement") {
        router.push({
          pathname: "/(app)/composer/movement",
          params: { from: "you" },
        });
        return;
      }
      router.push({
        pathname: "/(app)/composer/[type]",
        params: {
          type,
          from: "you",
          pickerReturn: pickerReturnParamForType(type),
        },
      });
    },
    [router]
  );

  const goToday = useCallback(() => router.push("/(app)/at-a-glance/today"), [router]);
  const goThisWeek = useCallback(() => router.push("/(app)/at-a-glance/this-week"), [router]);
  const goUpcoming = useCallback(() => router.push("/(app)/at-a-glance/upcoming"), [router]);
  const goAllRecords = useCallback(
    () => router.push("/(app)/(tabs)/saved-records"),
    [router]
  );
  const openPack = useCallback(
    (id: string) => {
      router.push({ pathname: "/(app)/professional-pack/[id]", params: { id } });
    },
    [router]
  );

  const sectionLink = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8}>
      <Text style={styles.sectionLink}>{label}</Text>
    </Pressable>
  );

  const addBar = (
    <PremiumNewRecordButton
      label={t("you.addEntryBar")}
      onPress={() => setPickerOpen(true)}
      accessibilityLabel={t("you.fabLabel")}
    />
  );

  return (
    <>
      <Screen
        scroll
        padded
        tabBarInset
        footer={addBar}
        refreshing={pullRefreshing}
        onRefresh={onRefresh}
      >
      <View style={styles.dashboard}>
        <View style={styles.topCluster}>
          <View style={styles.heroWrap}>
            <UserGreetingHeader
              user={user}
              savedPdfTotal={dashboard.savedPdfTotal}
              onAvatarPress={() =>
                router.push({
                  pathname: "/(app)/settings/identity",
                  params: { from: "you" },
                })
              }
            />
          </View>

          <View style={styles.topSearchWrap}>
            <GlobalSearchBar />
          </View>

          <View style={styles.topSyncWrap}>
            <SyncStatusBanner />
          </View>

          {!online ? (
            <View style={[styles.banner, styles.topOfflineWrap]}>
              <Banner tone="warning" message={t("common.offline")} />
            </View>
          ) : null}
          {error ? (
            <View style={[styles.banner, styles.topOfflineWrap]}>
              <Banner tone="danger" message={error} />
            </View>
          ) : null}
          <View style={styles.topDivider} />
          <LastRefreshedHint message={refreshNote} />
        </View>

        <View>
          <SmartHeadline
            title={t("you.summary")}
            subtitle={t("you.summarySub")}
            density="dashboard"
            iconName="view-dashboard-outline"
            accentKey="work"
          />
          <View style={styles.statsRow}>
            <DashboardStatTile
              value={dashboard.stats.today}
              label={t("you.statsToday")}
              onPress={goToday}
              accessibilityLabel={t("you.statsToday")}
              accentKey="map"
            />
            <DashboardStatTile
              value={dashboard.stats.thisWeek}
              label={t("you.statsThisWeek")}
              onPress={goThisWeek}
              accessibilityLabel={t("you.statsThisWeek")}
              accentKey="work"
            />
            <DashboardStatTile
              value={dashboard.stats.upcoming}
              label={t("you.statsFollowUps")}
              onPress={goUpcoming}
              accessibilityLabel={t("you.statsFollowUps")}
              accentKey="reminder"
            />
          </View>
        </View>

        {visibility.showRecentActivity ? (
          <View>
            <SmartHeadline
              title={t("you.recent")}
              subtitle={t("you.recentSub")}
              density="dashboard"
              iconName="history"
              accentKey="work"
              rightSlot={sectionLink(t("common.seeAll"), goAllRecords)}
            />
            <View style={styles.list}>
              {dashboard.recentActivity.map((item, index) => {
                if (item.kind === "entry") {
                  const e = item.entry;
                  const deleteReq = {
                    entityType: "diary_entry" as const,
                    recordId: e.id,
                    title: e.title,
                    confirmTier: "record" as const,
                  };
                  const rowKey = e.id ? `recent-entry-${e.id}` : `recent-entry-idx-${index}`;
                  return (
                    <SwipeToDeleteRow
                      key={rowKey}
                      rowKey={rowKey}
                      recordId={e.id}
                      entityType="diary_entry"
                      title={e.title}
                      onDeletePress={() => requestDelete(deleteReq, refreshDashboard)}
                      deleteInProgress={isDeleting(deleteReq)}
                    >
                      <EntryRow entry={e} raised onPress={() => openEntry(e.id)} />
                    </SwipeToDeleteRow>
                  );
                }
                const p = item.pack;
                const deleteReq = {
                  entityType: "professional_pack" as const,
                  recordId: p.id,
                  title: p.title,
                  confirmTier: "record" as const,
                };
                const rowKey = p.id ? `recent-pack-${p.id}` : `recent-pack-idx-${index}`;
                return (
                  <SwipeToDeleteRow
                    key={rowKey}
                    rowKey={rowKey}
                    recordId={p.id}
                    entityType="professional_pack"
                    title={p.title}
                    onDeletePress={() => requestDelete(deleteReq, refreshDashboard)}
                    deleteInProgress={isDeleting(deleteReq)}
                  >
                    <Pressable
                      style={styles.packRow}
                      onPress={() => openPack(p.id)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.packTitle}>{p.title}</Text>
                      <Text style={styles.packMeta}>
                        {t("proPack.title")} ·{" "}
                        {t(matterLabelKey(p.professionalCategory, p.matterType))} ·{" "}
                        {formatEntryDate(p.matterDate)}
                      </Text>
                    </Pressable>
                  </SwipeToDeleteRow>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>
      </Screen>

      <ComposerPickerSheet
        visible={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setPickerWorkTeamExpanded(false);
        }}
        onPick={onPickComposer}
        initialWorkTeamExpanded={pickerWorkTeamExpanded}
      />
    </>
  );
}
