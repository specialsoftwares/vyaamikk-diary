import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { Banner, Button, Card, FormSection, Header, Screen, SelectField, TextField } from "@/components/ui";
import { useT } from "@/i18n";
import { getGrinFixtureRepository } from "@/services/grin/fixture";
import {
  movementLabel,
  portalStatusLabel,
  qcLabel,
} from "@/services/grin/grinDisplay";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmissionGate, GrinFixtureNotices } from "./GrinAdmissionGate";
import { GrinFieldRow } from "./GrinFieldRow";

export function GrinEwbScreen(): React.ReactElement {
  const t = useT();
  const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
  const repo = getGrinFixtureRepository();
  const [record, setRecord] = useState(receiptId ? repo.get(receiptId) : null);
  const [source, setSource] = useState("Imported portal copy — not a live EWB portal");
  const [status, setStatus] = useState<"generated_active" | "cancelled" | "unknown">("unknown");
  const [error, setError] = useState<string | null>(null);

  const styles = useThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const onRecord = useCallback(() => {
    if (!receiptId) return;
    const result = repo.recordEwbPortal({
      receiptId,
      status,
      source,
      observedAtUtc: new Date().toISOString(),
      verificationLevel: "imported_document",
      evidence:
        status === "cancelled"
          ? {
              reason: "Recorded cancellation observation in fixture UI.",
              goodsMoved: "unknown",
              goodsMovedUnknownReason: "Movement after cancellation is not known from this imported copy.",
              linkedDocument: { kind: "missing", exceptionReason: "Linked document was not in the imported copy." },
              party: "unknown party",
              amount: { kind: "unknown", reason: "Amount not on the imported copy." },
              replacementEbn: { kind: "pending", reason: "Replacement EBN not supplied." },
            }
          : undefined,
    });
    if (!result.ok) {
      setError(t(result.userMessageKey));
      return;
    }
    setRecord(result.record);
    setError(null);
  }, [receiptId, repo, source, status, t]);

  const histories = record?.ewbHistories;

  return (
    <GrinAdmissionGate title={t("grin.ewbTitle")}>
      <Screen scroll>
        <View style={styles.wrap}>
          <Header title={t("grin.ewbTitle")} showBack />
          <GrinFixtureNotices />
          <Banner tone="info" message={t("grin.ewbPortalVsMovement")} />
          <Banner tone="warning" message={t("grin.ewbDeliveryDoesNotCancel")} />
          {error ? <Banner tone="danger" message={error} /> : null}

          <FormSection title={t("grin.ewbPortal")}>
            {(histories?.portal ?? []).map((obs, index) => (
              <Card key={`${obs.observedAtUtc}-${index}`} elevated={false}>
                <GrinFieldRow label={t("grin.ewbPortal")} value={portalStatusLabel(obs.status, t)} />
                <GrinFieldRow label={t("grin.exception.source")} value={obs.source} />
                <GrinFieldRow label={t("grin.exception.observedAt")} value={obs.observedAtUtc} />
                {obs.status === "cancelled" ? (
                  <GrinFieldRow label={t("grin.ewbCancellation")} value={obs.evidence.reason} />
                ) : null}
                {obs.status === "cancellation_unvalidated" ? (
                  <GrinFieldRow
                    label={t("grin.ewb.status.cancellationUnvalidated")}
                    value={obs.incompleteReasons.join("; ")}
                  />
                ) : null}
              </Card>
            ))}
          </FormSection>

          <FormSection title={t("grin.ewbMovement")}>
            {(histories?.movementEvents ?? []).map((evt, index) => (
              <GrinFieldRow
                key={`${evt.atUtc}-${index}`}
                label={movementLabel(evt.movement, t)}
                value={`${evt.atUtc} — ${evt.reason}`}
              />
            ))}
          </FormSection>

          <FormSection title={t("grin.ewbQc")}>
            {(histories?.qcEvents ?? []).map((evt, index) => (
              <GrinFieldRow
                key={`${evt.atUtc}-${index}`}
                label={qcLabel(evt.qc, t)}
                value={`${evt.atUtc} — ${evt.reason}`}
              />
            ))}
          </FormSection>

          <FormSection title={t("grin.ewbRecordPortal")}>
            <SelectField
              label={t("grin.ewbPortal")}
              value={status}
              options={[
                { value: "unknown", label: t("grin.ewb.status.unknown") },
                { value: "generated_active", label: t("grin.ewb.status.generatedActive") },
                { value: "cancelled", label: t("grin.ewb.status.cancelled") },
              ]}
              onChange={(value) => setStatus(value as typeof status)}
            />
            <TextField
              label={t("grin.exception.source")}
              value={source}
              onChangeText={setSource}
              accessibilityLabel={t("grin.exception.source")}
            />
            <Button label={t("grin.ewbRecordPortal")} onPress={onRecord} />
          </FormSection>
        </View>
      </Screen>
    </GrinAdmissionGate>
  );
}
