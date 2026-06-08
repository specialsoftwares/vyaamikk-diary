import React, { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { EmptyState,
  Header,
  LastRefreshedHint,
  Screen,
  SkeletonList,
  SkeletonLoadingPanel,
  SkeletonStatutoryCard, LocaleUiText } from "@/components/ui";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { useCategoryAccent } from "@/theme/useBrandTokens";
import {
  buildStatutoryTabViewModel,
  type StatutoryCategory,
  type StatutoryTabItem,
  type StatutoryTabViewModel,
  type StatutoryUrgencyGroup,
} from "@/services/statutory";
import { spacing, typography, useThemedStyles } from "@/theme";

const FILTERS: Array<StatutoryCategory | "all"> = ["all", "GST", "IncomeTax", "TDS_TCS", "LLP"];
const URGENCY_ORDER: StatutoryUrgencyGroup[] = ["1", "3", "5", "7", "later"];

export function StatutoryInformationScreen() {
  const t = useT();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { user } = useAuth();
  const statutoryAccent = useCategoryAccent("statutory");
  const [filter, setFilter] = useState<StatutoryCategory | "all">("all");
  const [view, setView] = useState<StatutoryTabViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnceRef = useRef(false);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      disclaimer: {
        ...typography.caption,
        color: c.textMuted,
        lineHeight: 20,
        marginBottom: spacing.lg,
      },
      filterRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
      chip: {
        paddingVertical: 6,
        paddingHorizontal: spacing.md,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: c.divider,
        backgroundColor: c.surfaceMuted,
      },
      chipOn: {
        borderColor: statutoryAccent.main,
        backgroundColor: statutoryAccent.soft,
      },
      chipText: { ...typography.caption, color: c.text },
      chipTextOn: { color: statutoryAccent.main },
      sectionTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        marginBottom: spacing.sm,
      },
      sectionDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: statutoryAccent.main,
      },
      sectionTitle: {
        ...typography.captionStrong,
        color: c.textMuted,
        letterSpacing: 0.5,
        textTransform: "uppercase",
      },
      card: {
        backgroundColor: c.surfaceMuted,
        borderRadius: 12,
        padding: spacing.md,
        marginBottom: spacing.sm,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        borderLeftWidth: 3,
      },
      cardTitle: { ...typography.bodyStrong, color: c.text },
      cardMeta: { ...typography.caption, marginTop: 4 },
      cardBody: { ...typography.caption, color: c.textMuted, marginTop: spacing.xs, lineHeight: 18 },
      cardNote: { ...typography.micro, color: c.textSubtle, marginTop: spacing.xs },
    })
  );

  const load = useCallback(
    async (mode: "mount" | "refresh" = "mount") => {
      if (!user?.uid) {
        setView(null);
        setLoading(false);
        setRefreshing(false);
        hasLoadedOnceRef.current = false;
        return;
      }
      if (mode === "refresh" && hasLoadedOnceRef.current) {
        setRefreshing(true);
      } else if (!hasLoadedOnceRef.current) {
        setLoading(true);
      }
      try {
        const vm = await buildStatutoryTabViewModel(user.uid, t, filter);
        setView(vm);
        hasLoadedOnceRef.current = true;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.uid, t, filter]
  );

  const { refreshNote, onRefresh, refreshing: pullRefreshing } = useAppRefresh({
    onReload: () => load("refresh"),
    externalRefreshing: refreshing,
  });

  useFocusEffect(
    useCallback(() => {
      void load("mount");
    }, [load])
  );

  const openItem = (item: StatutoryTabItem) => {
    router.push({
      pathname: "/statutory/detail",
      params: { occurrenceId: item.occurrenceId, templateId: item.templateId },
    });
  };

  const renderCard = (item: StatutoryTabItem) => (
    <Pressable
      key={item.occurrenceId}
      style={[
        styles.card,
        { borderLeftColor: statutoryAccent.highlight ?? statutoryAccent.main },
      ]}
      onPress={() => openItem(item)}
    >
      <Text style={styles.cardTitle}>
        {item.periodLine ? `${item.title} — ${item.periodLine}` : item.title}
      </Text>
      {item.dueDateMs > 0 ? (
        <>
          <Text style={[styles.cardMeta, { color: statutoryAccent.main }]}>{item.dueLine}</Text>
          {item.daysLeft >= 0 ? (
            <LocaleUiText style={styles.cardNote}>
              {t("statutory.card.daysLeft", { days: item.daysLeft })}
            </LocaleUiText>
          ) : null}
        </>
      ) : null}
      <Text style={styles.cardBody}>{item.applicability}</Text>
      <Text style={styles.cardNote}>{item.body}</Text>
    </Pressable>
  );

  const headerBlock = (
    <Header
      variant="executive"
      title={t("statutory.tabTitle")}
      subtitle={t("statutory.tabSubtitle")}
      showBack
      backFrom={from === "settings" ? "settings" : undefined}
      fallback="/(app)/(tabs)/settings"
    />
  );

  return (
    <Screen
      scroll
      extraBottomPadding={spacing.lg}
      refreshing={pullRefreshing}
      onRefresh={onRefresh}
    >
      {headerBlock}
      <LocaleUiText style={styles.disclaimer}>{view?.disclaimer ?? t("statutory.disclaimer")}</LocaleUiText>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)}>
            <View style={[styles.chip, filter === f ? styles.chipOn : null]}>
              <LocaleUiText style={[styles.chipText, filter === f ? styles.chipTextOn : null]}>
                {t(`statutory.filters.${f}`)}
              </LocaleUiText>
            </View>
          </Pressable>
        ))}
      </View>

      <LastRefreshedHint message={refreshNote} />

      {loading && !view ? (
        <SkeletonLoadingPanel loading slowMessage={t("skeleton.stillLoading")}>
          <SkeletonList count={4} Item={SkeletonStatutoryCard} />
        </SkeletonLoadingPanel>
      ) : null}

      {!loading && view ? (
        <>
          {URGENCY_ORDER.map((u) => {
            const items = view.upcoming[u];
            if (!items.length) return null;
            return (
              <View key={u} style={{ marginBottom: spacing.lg }}>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionDot} />
                  <LocaleUiText style={styles.sectionTitle}>{t(`statutory.urgency.${u}`)}</LocaleUiText>
                </View>
                {items.map(renderCard)}
              </View>
            );
          })}

          {view.reference.length ? (
            <View style={{ marginBottom: spacing.lg }}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionDot} />
                <LocaleUiText style={styles.sectionTitle}>{t("statutory.sections.reference")}</LocaleUiText>
              </View>
              {view.reference.map(renderCard)}
            </View>
          ) : null}

          {view.dismissed.length ? (
            <View style={{ marginBottom: spacing.lg }}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionDot} />
                <LocaleUiText style={styles.sectionTitle}>{t("statutory.sections.dismissed")}</LocaleUiText>
              </View>
              {view.dismissed.slice(0, 20).map(renderCard)}
            </View>
          ) : null}

          {!URGENCY_ORDER.some((u) => view.upcoming[u].length) &&
          !view.reference.length &&
          !view.dismissed.length ? (
            <EmptyState
              title={t("statutory.empty.title")}
              message={t("statutory.empty.message")}
              accentKey="statutory"
              iconName="shield-check-outline"
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
