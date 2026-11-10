import React, { useCallback, useMemo, useRef, useState } from "react";

import { captureLoadClaim } from "@/components/screenState/resolveScreenState";
import { currentSessionCommitEpoch } from "@/services/auth/authSessionFence";

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

import { grinFeatureNotAdmitted, grinMutationErrorMessage } from "./grinActionErrors";
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
  Banner,
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
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

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
    const claim = captureLoadClaim(session.ownerUid, ++generation.current);
    const stillThisRequest = () =>
      generation.current === claim.generation &&
      currentSessionCommitEpoch() === claim.epoch &&
      session.ownerUid === claim.uid;
    try {
      const next = originRepo(origin).list();
      if (!stillThisRequest()) return;
      setItems(next);
      setError(null);
      setPhase("ready");
    } catch (caught) {
      if (generation.current !== claim.generation) return;
      const mapped = grinMutationErrorMessage(caught, t, "grin.errSave");
      if (mapped.retired || !stillThisRequest()) setItems([]);
      setError(mapped.retired ? t("grin.errSessionRetired") : mapped.message);
      setPhase("error");
    }
  }, [origin, session.ownerUid, t]);

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
          {item.offlinePending || item.displayNumber == null ? (
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

  if (items.some((item) => grinFeatureNotAdmitted(item.lastErrorActionable))) {
    return (
      <Screen padded={false} dismissKeyboardOnTap={false}>
        <View style={styles.headerWrap}>
          <Header title={t("grin.listTitle")} subtitle={t("grin.listSubtitle")} showBack />
          <EmptyState title={t("grin.unavailableTitle")} message={t("grin.unavailableBody")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false} dismissKeyboardOnTap={false}>
      <View style={styles.headerWrap}>
        <Header title={t("grin.listTitle")} subtitle={t("grin.listSubtitle")} showBack />
        <GrinFixtureNotices />
        <Button label={t("grin.newAction")} onPress={goNew} style={styles.newBtn} />
        {phase === "error" && error ? (
          <>
            <Banner tone="danger" message={error} />
            <Button label={t("common.retry")} onPress={load} variant="secondary" />
          </>
        ) : null}
      </View>
      <FlatList
        data={phase === "ready" || items.length > 0 ? items : []}
        keyExtractor={(d: GrinApplicationListItem) => d.receiptId}
        renderItem={renderItem}
        initialNumToRender={10}
        removeClippedSubviews={Platform.OS === "android"}
        contentContainerStyle={listPadding}
        ListEmptyComponent={
          phase === "ready" ? (
            <EmptyState
              title={t("grin.emptyTitle")}
              message={t("grin.emptyMessage")}
              actionLabel={t("grin.newAction")}
              onAction={goNew}
            />
          ) : null
        }
      />
    </Screen>
  );
}
