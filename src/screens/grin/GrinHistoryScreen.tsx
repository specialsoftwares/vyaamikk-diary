import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";

import { Banner, Card, EmptyState, FormSection, Header, Screen } from "@/components/ui";
import { useT } from "@/i18n";
import type { GrinCommandType } from "@/goodsEvidence/ports";
import {
  requireLiveGrinApplicationRepository,
  type GrinApplicationLookup,
  type GrinLocalHistoryItem,
} from "@/services/grin/repository";
import { localStateLabel } from "@/services/grin/grinDisplay";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmissionGate, GrinFixtureNotices } from "./GrinAdmissionGate";
import { GrinFieldRow } from "./GrinFieldRow";

function commandTypeLabel(type: GrinCommandType | "unreadable", t: (key: string) => string): string {
  switch (type) {
    case "registerGoodsReceipt":
      return t("grin.event.receiptRegistered");
    case "amendFields":
      return t("grin.event.fieldAmended");
    case "recordQc":
      return t("grin.event.qcDecision");
    case "dispatchReturn":
      return t("grin.event.returnDispatched");
    case "recordEwbObservation":
      return t("grin.event.ewbObservation");
    default:
      return t("grin.event.other");
  }
}

export function GrinHistoryScreen(): React.ReactElement {
  const t = useT();
  return (
    <GrinAdmissionGate title={t("grin.historyTitle")}>
      <GrinHistoryAdmittedBody />
    </GrinAdmissionGate>
  );
}

function GrinHistoryAdmittedBody(): React.ReactElement {
  const t = useT();
  const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
  const [lookup, setLookup] = useState<GrinApplicationLookup | null>(null);
  const [events, setEvents] = useState<GrinLocalHistoryItem[]>([]);
  const styles = useThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const load = useCallback(() => {
    if (!receiptId) {
      setLookup(null);
      setEvents([]);
      return;
    }
    try {
      const repo = requireLiveGrinApplicationRepository();
      setLookup(repo.lookup(receiptId));
      setEvents(repo.history(receiptId));
    } catch {
      setLookup(null);
      setEvents([]);
    }
  }, [receiptId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const originalNumber =
    lookup?.projection === "readable"
      ? lookup.original.issuedNumber ?? t("grin.pdf.pendingNumber")
      : lookup?.issuedNumber ?? t("grin.pdf.pendingNumber");

  const cards = useMemo(
    () =>
      [...events].reverse().map((event) => (
        <Card key={event.commandId} elevated={false}>
          <GrinFieldRow label={t("grin.historyTitle")} value={commandTypeLabel(event.commandType, t)} />
          <GrinFieldRow
            label={t("grin.local.issued")}
            value={
              event.localState === "unknown_incomplete"
                ? t("grin.projection.incomplete")
                : localStateLabel(event.localState, t)
            }
          />
          <GrinFieldRow label={t("grin.historyLocalOnly")} value={event.source} />
        </Card>
      )),
    [events, t]
  );

  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Header title={t("grin.historyTitle")} showBack />
        <GrinFixtureNotices />
        <Banner tone="info" message={t("grin.historyLocalOnly")} />
        <FormSection title={t("grin.originalUnchanged")}>
          <GrinFieldRow label={t("grin.field.grinNumber")} value={originalNumber} />
        </FormSection>
        {events.length === 0 ? <EmptyState title={t("grin.historyEmpty")} /> : cards}
      </View>
    </Screen>
  );
}
