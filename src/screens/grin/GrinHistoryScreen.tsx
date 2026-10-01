import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { Card, EmptyState, FormSection, Header, Screen } from "@/components/ui";
import { useT } from "@/i18n";
import type { GrinEventType } from "@/goodsEvidence/types";
import { getGrinFixtureRepository } from "@/services/grin/fixture";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmissionGate, GrinFixtureNotices } from "./GrinAdmissionGate";
import { GrinFieldRow } from "./GrinFieldRow";

function eventTypeLabel(type: GrinEventType, t: (key: string) => string): string {
  switch (type) {
    case "receipt_registered":
      return t("grin.event.receiptRegistered");
    case "field_amended":
      return t("grin.event.fieldAmended");
    case "qc_decision":
      return t("grin.event.qcDecision");
    case "qc_reclassified":
      return t("grin.event.qcReclassified");
    case "ewb_observation_recorded":
      return t("grin.event.ewbObservation");
    case "return_dispatched":
      return t("grin.event.returnDispatched");
    case "rejection_recorded":
      return t("grin.event.rejectionRecorded");
    default:
      return t("grin.event.other");
  }
}

export function GrinHistoryScreen(): React.ReactElement {
  const t = useT();
  const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
  const record = receiptId ? getGrinFixtureRepository().get(receiptId) : null;
  const events = record?.events ?? [];
  const styles = useThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const originalNumber = record?.original.issuedNumber ?? t("grin.pdf.pendingNumber");

  const cards = useMemo(
    () =>
      [...events].reverse().map((event) => (
        <Card key={event.eventId} elevated={false}>
          <GrinFieldRow label={t("grin.historyTitle")} value={eventTypeLabel(event.type, t)} />
          <GrinFieldRow label={t("grin.field.reason")} value={event.reason} />
          <GrinFieldRow label={t("grin.exception.observedAt")} value={event.serverAcceptedAtUtc} />
        </Card>
      )),
    [events, t]
  );

  return (
    <GrinAdmissionGate title={t("grin.historyTitle")}>
      <Screen scroll>
        <View style={styles.wrap}>
          <Header title={t("grin.historyTitle")} showBack />
          <GrinFixtureNotices />
          <FormSection title={t("grin.originalUnchanged")}>
            <GrinFieldRow label={t("grin.field.grinNumber")} value={originalNumber} />
          </FormSection>
          {events.length === 0 ? <EmptyState title={t("grin.historyEmpty")} /> : cards}
        </View>
      </Screen>
    </GrinAdmissionGate>
  );
}
