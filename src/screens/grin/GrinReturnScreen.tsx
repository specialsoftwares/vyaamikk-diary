import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { Banner, Button, FormSection, Header, Screen, TextField } from "@/components/ui";
import { useT } from "@/i18n";
import { quantity } from "@/goodsEvidence/quantities";
import {
  GRIN_MUTATION_QUEUE_UNINJECTED,
  requireLiveGrinApplicationRepository,
  type GrinApplicationRecord,
} from "@/services/grin/repository";
import { formatQuantity } from "@/services/grin/grinDisplay";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmissionGate, GrinFixtureNotices } from "./GrinAdmissionGate";
import { GrinFieldRow } from "./GrinFieldRow";

export function GrinReturnScreen(): React.ReactElement {
  const t = useT();
  return (
    <GrinAdmissionGate title={t("grin.returnTitle")}>
      <GrinReturnAdmittedBody />
    </GrinAdmissionGate>
  );
}

function GrinReturnAdmittedBody(): React.ReactElement {
  const t = useT();
  const router = useRouter();
  const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
  const [record, setRecord] = useState<GrinApplicationRecord | null>(null);
  const [queuedReturn, setQueuedReturn] = useState<{ value: string; unit: string } | null>(null);
  const [qty, setQty] = useState("");
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
      setQueuedReturn(null);
      return;
    }
    try {
      const repo = requireLiveGrinApplicationRepository();
      const loaded = repo.get(receiptId);
      setRecord(loaded);
      const lineId = loaded?.effective.lines[0]?.lineId;
      setQueuedReturn(lineId ? repo.queuedReturnQty(receiptId, lineId) : null);
    } catch {
      setRecord(null);
      setQueuedReturn(null);
    }
  }, [receiptId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const line = record?.effective.lines[0];

  const onSave = useCallback(() => {
    if (!receiptId || !line) return;
    try {
      requireLiveGrinApplicationRepository().dispatchReturn({
        receiptId,
        reason,
        lineId: line.lineId,
        returnQty: quantity(qty.trim(), line.unit),
      });
      router.back();
    } catch (caught) {
      if (caught instanceof Error && caught.message === "return_reason_required") {
        setError(t("grin.errReturnReason"));
        return;
      }
      if (caught instanceof Error && caught.message === GRIN_MUTATION_QUEUE_UNINJECTED) {
        setError(t("grin.mutationUnavailable"));
        return;
      }
      setError(t("grin.errReturn"));
    }
  }, [line, qty, reason, receiptId, router, t]);

  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Header title={t("grin.returnTitle")} subtitle={t("grin.returnIntro")} showBack />
        <GrinFixtureNotices />
        <Banner tone="info" message={t("grin.returnUnitHint")} />
        <Banner tone="info" message={t("grin.returnWeightSeparate")} />
        <Banner tone="info" message={t("grin.returnPackagesSeparate")} />
        {error ? <Banner tone="danger" message={error} /> : null}
        <FormSection title={t("grin.section.lines")}>
          <GrinFieldRow
            label={t("grin.field.receivedQty")}
            value={formatQuantity(line?.physicallyReceived ?? null, t)}
          />
          <GrinFieldRow
            label={t("grin.field.returnQty")}
            value={
              queuedReturn ? `${queuedReturn.value} ${queuedReturn.unit}` : t("grin.projection.incomplete")
            }
          />
          <GrinFieldRow label={t("grin.field.netWeight")} value={formatQuantity(line?.netWeight ?? null, t)} />
          <GrinFieldRow label={t("grin.field.packageCount")} value={formatQuantity(line?.packageCount ?? null, t)} />
          <TextField
            label={t("grin.returnQty")}
            value={qty}
            onChangeText={setQty}
            keyboardType="decimal-pad"
            hint={line ? line.unit : undefined}
            accessibilityLabel={t("grin.returnQty")}
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
