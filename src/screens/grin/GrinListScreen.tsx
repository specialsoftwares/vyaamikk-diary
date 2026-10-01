import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import {
  Button,
  Card,
  EmptyState,
  Header,
  Screen,
} from "@/components/ui";
import { useT } from "@/i18n";
import { getGrinFixtureRepository } from "@/services/grin/fixture";
import type { GrinListItem } from "@/services/grin/fixture/types";
import {
  captureLabel,
  custodyLabel,
  localStateLabel,
  offlinePendingBannerText,
  qcLabel,
} from "@/services/grin/grinDisplay";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

import { GrinAdmissionGate, GrinFixtureNotices } from "./GrinAdmissionGate";

export function GrinListScreen(): React.ReactElement {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<GrinListItem[]>([]);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      headerWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
      newBtn: { marginBottom: spacing.md },
      listContent: { gap: spacing.md, paddingHorizontal: spacing.lg },
      rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
      number: { ...typography.titleSm, color: c.text },
      supplier: { ...typography.body, color: c.text },
      meta: { ...typography.caption, color: c.textMuted },
      pill: {
        alignSelf: "flex-start",
        backgroundColor: c.primaryLight,
        paddingVertical: 2,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        marginTop: spacing.xs,
      },
      pillText: { ...typography.micro, color: c.primaryDark },
      warnPill: {
        alignSelf: "flex-start",
        backgroundColor: "#FFF6E5",
        paddingVertical: 2,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        marginTop: spacing.xs,
      },
      warnText: { ...typography.micro, color: c.warning },
    })
  );

  const load = useCallback(() => {
    setItems(getGrinFixtureRepository().list());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const goNew = useCallback(() => {
    router.push("/(app)/grin/create");
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: GrinListItem }) => {
      const number = item.displayNumber ?? t("grin.pdf.pendingNumber");
      return (
        <Card elevated={false}>
          <View style={styles.rowTop}>
            <Text style={styles.number}>{number}</Text>
            <Text style={styles.meta}>{localStateLabel(item.localState, t)}</Text>
          </View>
          <Text style={styles.supplier}>{item.supplierName}</Text>
          <Text style={styles.meta}>
            {custodyLabel(item.custody, t)} · {qcLabel(item.qcStatus, t)} · {captureLabel(item.captureProvenance, t)}
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
            onPress={() =>
              router.push({ pathname: "/(app)/grin/[receiptId]", params: { receiptId: item.receiptId } })
            }
            style={{ marginTop: spacing.sm }}
          />
        </Card>
      );
    },
    [router, styles, t]
  );

  const listPadding = useMemo(
    () => [styles.listContent, { paddingBottom: insets.bottom + spacing.xxl }],
    [styles.listContent, insets.bottom]
  );

  return (
    <GrinAdmissionGate title={t("grin.listTitle")} subtitle={t("grin.listSubtitle")}>
      <Screen padded={false} dismissKeyboardOnTap={false}>
        <View style={styles.headerWrap}>
          <Header title={t("grin.listTitle")} subtitle={t("grin.listSubtitle")} showBack />
          <GrinFixtureNotices />
          <Button label={t("grin.newAction")} onPress={goNew} style={styles.newBtn} />
        </View>
        <FlatList
          data={items}
          keyExtractor={(d) => d.receiptId}
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
    </GrinAdmissionGate>
  );
}
