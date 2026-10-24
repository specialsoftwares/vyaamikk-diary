import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";

import { Banner, Card, EmptyState, FormSection, Header, Screen } from "@/components/ui";
import { useT } from "@/i18n";
import type { GrinCommandType } from "@/goodsEvidence/ports";
import type { GrinEventType } from "@/goodsEvidence/types";
import type { GrinApplicationLookup, GrinLocalHistoryItem } from "@/services/grin/repository";
import { localStateLabel } from "@/services/grin/grinDisplay";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmissionGate, GrinFixtureNotices } from "./GrinAdmissionGate";
import { GrinFieldRow } from "./GrinFieldRow";
import { originRepo, useFrozenGrinOrigin } from "./grinScreenHooks";

function commandTypeLabel(
  type: GrinCommandType | GrinEventType | "unreadable",
  t: (key: string) => string
): string {
  switch (type) {
    case "registerGoodsReceipt":
    case "receipt_registered":
      return t("grin.event.receiptRegistered");
    case "amendFields":
    case "field_amended":
      return t("grin.event.fieldAmended");
    case "recordQc":
    case "qc_decision":
    case "qc_reclassified":
      return t("grin.event.qcDecision");
    case "dispatchReturn":
    case "return_dispatched":
      return t("grin.event.returnDispatched");
    case "recordEwbObservation":
    case "ewb_observation_recorded":
      return t("grin.event.ewbObservation");
    default:
      return t("grin.event.other");
  }
}

function historyStateLabel(item: GrinLocalHistoryItem, t: (key: string) => string): string {
  if (item.source === "confirmed_event" || item.localState === "confirmed") {
    return t("grin.historyConfirmed");
  }
  if (item.localState === "unknown_incomplete") return t("grin.projection.incomplete");
  return localStateLabel(item.localState, t);
}

export function GrinHistoryScreen(): React.ReactElement {
  const t = useT();
  return (
    <GrinAdmissionGate title={t("grin.historyTitle")}>
      {(session) => <GrinHistoryAdmittedBody session={session} />}
    </GrinAdmissionGate>
  );
}

function GrinHistoryAdmittedBody({ session }: { session: GrinDispatchSession }): React.ReactElement {
  const origin = useFrozenGrinOrigin(session);
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
      const repo = originRepo(origin);
      setLookup(repo.lookup(receiptId));
      setEvents(repo.history(receiptId));
    } catch {
      setLookup(null);
      setEvents([]);
    }
  }, [origin, receiptId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const originalNumber =
    lookup?.projection === "readable"
      ? lookup.original.issuedNumber ?? t("grin.pdf.pendingNumber")
      : lookup?.issuedNumber ?? t("grin.pdf.pendingNumber");

  const confirmed = events.filter((item) => item.source === "confirmed_event");
  const pending = events.filter((item) => item.source !== "confirmed_event");

  const renderLane = (items: GrinLocalHistoryItem[]) =>
    items
      .slice()
      .reverse()
      .map((event) => (
        <Card key={event.eventId ?? event.commandId ?? `${event.commandType}-${event.digest}`} elevated={false}>
          <GrinFieldRow label={t("grin.historyTitle")} value={commandTypeLabel(event.commandType, t)} />
          <GrinFieldRow label={t("grin.local.issued")} value={historyStateLabel(event, t)} />
          <GrinFieldRow
            label={event.source === "confirmed_event" ? t("grin.historyConfirmed") : t("grin.historyPending")}
            value={event.source}
          />
        </Card>
      ));

  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Header title={t("grin.historyTitle")} showBack />
        <GrinFixtureNotices />
        <Banner tone="info" message={t("grin.historyOutboxNotConfirmed")} />
        <FormSection title={t("grin.originalUnchanged")}>
          <GrinFieldRow label={t("grin.field.grinNumber")} value={originalNumber} />
        </FormSection>
        <FormSection title={t("grin.historyConfirmed")}>
          {confirmed.length === 0 ? <EmptyState title={t("grin.historyConfirmedEmpty")} /> : renderLane(confirmed)}
        </FormSection>
        <FormSection title={t("grin.historyPending")}>
          {pending.length === 0 ? <EmptyState title={t("grin.historyEmpty")} /> : renderLane(pending)}
        </FormSection>
      </View>
    </Screen>
  );
}
