import React, { useCallback, useState } from "react";

import { emptyEwbHistories, type EwbHistories } from "@/goodsEvidence/ewb";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { movementLabel, portalStatusLabel, qcLabel } from "@/services/grin/grinDisplay";
import { spacing } from "@/theme/spacing";

import { grinMutationErrorMessage } from "./grinActionErrors";
import { GrinFieldRow } from "./GrinFieldRow";
import { GrinFixtureNotices } from "./GrinFixtureNotices";
import {
  originRepo,
  useFrozenGrinOrigin,
  useGrinFocusEffect,
  useGrinLocalSearchParams,
  useGrinT,
  useGrinThemedStyles,
} from "./grinScreenHooks";
import { Banner, Button, Card, FormSection, Header, Screen, SelectField, TextField, View, StyleSheet } from "./grinSurfaces";

export function GrinEwbAdmittedBody({ session }: { session: GrinDispatchSession }): React.ReactElement {
  const origin = useFrozenGrinOrigin(session);
  const t = useGrinT();
  const { receiptId } = useGrinLocalSearchParams<{ receiptId: string }>();
  const [histories, setHistories] = useState<EwbHistories>(emptyEwbHistories());
  const [source, setSource] = useState("Imported document copy — not a live EWB portal");
  const [status, setStatus] = useState<"generated_active" | "cancelled" | "unknown">("unknown");
  const [error, setError] = useState<string | null>(null);

  const styles = useGrinThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const maskRetired = useCallback(() => {
    setHistories(emptyEwbHistories());
    setSource("");
  }, []);

  const load = useCallback(() => {
    if (!receiptId) {
      setHistories(emptyEwbHistories());
      return;
    }
    try {
      setHistories(originRepo(origin).ewbHistories(receiptId));
    } catch (caught) {
      if (grinMutationErrorMessage(caught, t, "grin.errEwb").retired) {
        maskRetired();
        setError(t("grin.errSessionRetired"));
        return;
      }
      setHistories(emptyEwbHistories());
    }
  }, [maskRetired, origin, receiptId, t]);

  useGrinFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRecord = useCallback(() => {
    if (!receiptId) return;
    try {
      originRepo(origin);
      const observedAtUtc = new Date().toISOString();
      originRepo(origin).recordEwbObservation({
        receiptId,
        reason: "Recorded portal observation — not e-way bill portal authority.",
        channel: "portal",
        observation:
          status === "cancelled"
            ? {
                status,
                source,
                observedAtUtc,
                verificationLevel: "imported_document",
                evidence: {
                  reason: "Cancellation observed from an imported copy — not a live portal.",
                  goodsMoved: "unknown",
                  goodsMovedUnknownReason: "Movement after cancellation is not known from this imported copy.",
                  linkedDocument: {
                    kind: "missing",
                    exceptionReason: "Linked document was not in the imported copy.",
                  },
                  party: "unknown party",
                  amount: { kind: "unknown", reason: "Amount not on the imported copy." },
                  replacementEbn: { kind: "pending", reason: "Replacement EBN not supplied." },
                },
              }
            : {
                status,
                source,
                observedAtUtc,
                verificationLevel: "imported_document",
              },
      });
      originRepo(origin);
      setHistories(originRepo(origin).ewbHistories(receiptId));
      setError(null);
    } catch (caught) {
      const mapped = grinMutationErrorMessage(caught, t, "grin.errEwb");
      if (mapped.retired) maskRetired();
      setError(mapped.message);
    }
  }, [maskRetired, origin, receiptId, source, status, t]);

  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Header title={t("grin.ewbTitle")} showBack />
        <GrinFixtureNotices />
        <Banner tone="info" message={t("grin.ewbPortalVsMovement")} />
        <Banner tone="warning" message={t("grin.ewbDeliveryDoesNotCancel")} />
        <Banner tone="info" message={t("grin.ewbObservationNotPortal")} />
        {error ? <Banner tone="danger" message={error} /> : null}

        <FormSection title={t("grin.ewbPortal")}>
          {histories.portal.length === 0 ? (
            <GrinFieldRow label={t("grin.ewbPortal")} value={t("grin.historyEmpty")} />
          ) : null}
          {histories.portal.map((obs, index) => (
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
          {histories.movementEvents.length === 0 ? (
            <GrinFieldRow label={t("grin.ewbMovement")} value={t("grin.historyEmpty")} />
          ) : null}
          {histories.movementEvents.map((evt, index) => (
            <GrinFieldRow
              key={`${evt.atUtc}-${index}`}
              label={movementLabel(evt.movement, t)}
              value={`${evt.atUtc} — ${evt.reason}`}
            />
          ))}
        </FormSection>

        <FormSection title={t("grin.ewbQc")}>
          {histories.qcEvents.length === 0 ? (
            <GrinFieldRow label={t("grin.ewbQc")} value={t("grin.historyEmpty")} />
          ) : null}
          {histories.qcEvents.map((evt, index) => (
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
            onChange={(value: string) => setStatus(value as typeof status)}
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
  );
}
