import React, { useCallback, useMemo, useState } from "react";

import type { GrinApplicationListItem } from "@/services/grin/repository";
import {
  captureLabel,
  custodyLabel,
  localStateLabel,
  offlinePendingBannerText,
  qcLabel,
} from "@/services/grin/grinDisplay";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { radius, spacing } from "@/theme/spacing";

import { grinMutationErrorMessage } from "./grinActionErrors";
import { GrinAdmissionGate } from "./GrinAdmissionGate";
import { GrinFixtureNotices } from "./GrinFixtureNotices";
import { bindProductionGrinScreenRuntime } from "./bindProductionGrinScreenRuntime";
import {
  originRepo,
  useFrozenGrinOrigin,
  useGrinFocusEffect,
  useGrinRouter,
  useGrinT,
  useGrinThemedStyles,
} from "./grinScreenHooks";
import {
  Button,
  Card,
  EmptyState,
  FlatList,
  Header,
  Platform,
  Screen,
  Text,
  View,
  StyleSheet,
  useSafeAreaInsets,
} from "./grinSurfaces";

export function GrinListScreen(): React.ReactElement {
  bindProductionGrinScreenRuntime();
  const t = useGrinT();
  return (
    <GrinAdmissionGate title={t("grin.listTitle")} subtitle={t("grin.listSubtitle")}>
      {(session) => <GrinListAdmittedBody session={session} />}
    </GrinAdmissionGate>
  );
}

export function GrinListAdmittedBody({ session }: { session: GrinDispatchSession }): React.ReactElement {
  const origin = useFrozenGrinOrigin(session);
  const t = useGrinT();
  const router = useGrinRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<GrinApplicationListItem[]>([]);

  const styles = useGrinThemedStyles((c) =>
    StyleSheet.create({
      headerWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
      newBtn: { marginBottom: spacing.md },
      listContent: { gap: spacing.md, paddingHorizontal: spacing.lg },
      rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
      number: { fontSize: 16, fontWeight: "700", color: c.text },
      supplier: { fontSize: 16, color: c.text },
      meta: { fontSize: 12, color: c.textMuted },
      pill: {
        alignSelf: "flex-start",
        backgroundColor: c.primaryLight,
        paddingVertical: 2,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        marginTop: spacing.xs,
      },
      pillText: { fontSize: 11, color: c.primaryDark },
      warnPill: {
        alignSelf: "flex-start",
        backgroundColor: "#FFF6E5",
        paddingVertical: 2,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        marginTop: spacing.xs,
      },
      warnText: { fontSize: 11, color: c.warning },
    })
  );

  const load = useCallback(() => {
    try {
      setItems(originRepo(origin).list());
    } catch (caught) {
      if (grinMutationErrorMessage(caught, t, "grin.errSave").retired) {
        setItems([]);
        return;
      }
      setItems([]);
    }
  }, [origin, t]);

  useGrinFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const goNew = useCallback(() => {
    originRepo(origin);
    router.push("/(app)/grin/create");
  }, [origin, router]);

  const renderItem = useCallback(
    ({ item }: { item: GrinApplicationListItem }) => {
      const number = item.displayNumber ?? t("grin.pdf.pendingNumber");
      const supplier = item.supplierName ?? t("grin.projection.incomplete");
      return (
        <Card elevated={false}>
          <View style={styles.rowTop}>
            <Text style={styles.number}>{number}</Text>
            <Text style={styles.meta}>{localStateLabel(item.localState, t)}</Text>
          </View>
          <Text style={styles.supplier}>{supplier}</Text>
          <Text style={styles.meta}>
            {item.projection === "unknown_incomplete"
              ? t("grin.projection.incomplete")
              : `${custodyLabel(item.custody, t)} · ${qcLabel(item.qcStatus, t)} · ${captureLabel(item.captureProvenance, t)}`}
          </Text>
          {item.offlinePending ? (
            <View style={styles.warnPill} accessibilityLabel={offlinePendingBannerText(t)}>
              <Text style={styles.warnText}>{offlinePendingBannerText(t)}</Text>
            </View>
          ) : (
            <View style={styles.pill}>
              <Text style={styles.pillText}>{t("grin.local.issued")}</Text>
            </View>
          )}
          {item.gateRefusal === "refused_at_gate" ? (
            <Text style={styles.meta}>{t("grin.gateRejection")}</Text>
          ) : null}
          {item.gateRefusal === "received_then_rejected" ? (
            <Text style={styles.meta}>{t("grin.receivedThenRejected")}</Text>
          ) : null}
          <Button
            label={t("common.open")}
            size="md"
            fullWidth={false}
            variant="secondary"
            onPress={() => {
              originRepo(origin);
              router.push({ pathname: "/(app)/grin/[receiptId]", params: { receiptId: item.receiptId } });
            }}
            style={{ marginTop: spacing.sm }}
          />
        </Card>
      );
    },
    [origin, router, styles, t]
  );

  const listPadding = useMemo(
    () => [styles.listContent, { paddingBottom: insets.bottom + spacing.xxl }],
    [styles.listContent, insets.bottom]
  );

  return (
    <Screen padded={false} dismissKeyboardOnTap={false}>
      <View style={styles.headerWrap}>
        <Header title={t("grin.listTitle")} subtitle={t("grin.listSubtitle")} showBack />
        <GrinFixtureNotices />
        <Button label={t("grin.newAction")} onPress={goNew} style={styles.newBtn} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(d: GrinApplicationListItem) => d.receiptId}
        renderItem={renderItem}
        initialNumToRender={10}
        removeClippedSubviews={Platform.OS === "android"}
        contentContainerStyle={listPadding}
        ListEmptyComponent={
          <EmptyState
            title={t("grin.emptyTitle")}
            message={t("grin.emptyMessage")}
            actionLabel={t("grin.newAction")}
            onAction={goNew}
          />
        }
      />
    </Screen>
  );
}
