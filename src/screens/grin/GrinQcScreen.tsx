import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { Banner, Button, FormSection, Header, Screen, TextField } from "@/components/ui";
import { useT } from "@/i18n";
import type { QcStatus } from "@/goodsEvidence/types";
import {
  GRIN_MUTATION_QUEUE_UNINJECTED,
  requireLiveGrinApplicationRepository,
  type GrinApplicationRecord,
} from "@/services/grin/repository";
import { qcLabel } from "@/services/grin/grinDisplay";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmissionGate, GrinFixtureNotices } from "./GrinAdmissionGate";
import { GrinChoiceRow } from "./GrinChoiceRow";
import { GrinFieldRow } from "./GrinFieldRow";

export function GrinQcScreen(): React.ReactElement {
  const t = useT();
  return (
    <GrinAdmissionGate title={t("grin.qcTitle")}>
      <GrinQcAdmittedBody />
    </GrinAdmissionGate>
  );
}

function GrinQcAdmittedBody(): React.ReactElement {
  const t = useT();
  const router = useRouter();
  const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
  const [record, setRecord] = useState<GrinApplicationRecord | null>(null);
  const [status, setStatus] = useState<QcStatus>("hold");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const styles = useThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const load = useCallback(() => {
    if (!receiptId) {
      setRecord(null);
      return;
    }
    try {
      setRecord(requireLiveGrinApplicationRepository().get(receiptId));
    } catch {
      setRecord(null);
    }
  }, [receiptId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onSave = useCallback(() => {
    if (!receiptId) return;
    try {
      requireLiveGrinApplicationRepository().recordQc({ receiptId, reason, qcStatus: status });
      router.back();
    } catch (caught) {
      if (caught instanceof Error && caught.message === "qc_reason_required") {
        setError(t("grin.errQcReason"));
        return;
      }
      if (caught instanceof Error && caught.message === GRIN_MUTATION_QUEUE_UNINJECTED) {
        setError(t("grin.mutationUnavailable"));
        return;
      }
      setError(t("grin.errSave"));
    }
  }, [receiptId, reason, router, status, t]);

  const currentQc = record?.effective.lines[0]?.qcStatus ?? null;

  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Header title={t("grin.qcTitle")} showBack />
        <GrinFixtureNotices />
        {error ? <Banner tone="danger" message={error} /> : null}
        <FormSection title={t("grin.section.inspection")}>
          <GrinFieldRow label={t("grin.field.qc")} value={qcLabel(currentQc, t)} />
          <GrinChoiceRow
            label={t("grin.field.qc")}
            value={status}
            options={[
              { value: "accepted", label: t("grin.qc.accepted") },
              { value: "hold", label: t("grin.qc.hold") },
              { value: "partial", label: t("grin.qc.partial") },
              { value: "rejected", label: t("grin.qc.rejected") },
            ]}
            onChange={(value) => setStatus(value as QcStatus)}
          />
          <TextField
            label={t("grin.field.reason")}
            value={reason}
            onChangeText={setReason}
            required
            multiline
            accessibilityLabel={t("grin.field.reason")}
          />
        </FormSection>
        <Button label={t("common.save")} onPress={onSave} />
      </View>
    </Screen>
  );
}
