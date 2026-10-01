import React, { useCallback, useState } from "react";

import { quantity } from "@/goodsEvidence/quantities";
import type { GrinApplicationRecord } from "@/services/grin/repository";
import { formatQuantity } from "@/services/grin/grinDisplay";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { spacing } from "@/theme/spacing";

import { grinMutationErrorMessage } from "./grinActionErrors";
import { GrinFieldRow } from "./GrinFieldRow";
import { GrinFixtureNotices } from "./GrinFixtureNotices";
import {
  originRepo,
  useFrozenGrinOrigin,
  useGrinFocusEffect,
  useGrinLocalSearchParams,
  useGrinRouter,
  useGrinT,
  useGrinThemedStyles,
} from "./grinScreenHooks";
import { Banner, Button, FormSection, Header, Screen, TextField, View, StyleSheet } from "./grinSurfaces";

export function GrinReturnAdmittedBody({ session }: { session: GrinDispatchSession }): React.ReactElement {
  const origin = useFrozenGrinOrigin(session);
  const t = useGrinT();
  const router = useGrinRouter();
  const { receiptId } = useGrinLocalSearchParams<{ receiptId: string }>();
  const [record, setRecord] = useState<GrinApplicationRecord | null>(null);
  const [queuedReturn, setQueuedReturn] = useState<{ value: string; unit: string } | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const styles = useGrinThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const maskRetired = useCallback(() => {
    setRecord(null);
    setQueuedReturn(null);
    setQty("");
    setReason("");
  }, []);

  const load = useCallback(() => {
    if (!receiptId) {
      setRecord(null);
      setQueuedReturn(null);
      return;
    }
    try {
      const repo = originRepo(origin);
      const loaded = repo.get(receiptId);
      setRecord(loaded);
      const lineId = loaded?.effective.lines[0]?.lineId;
      setQueuedReturn(lineId ? repo.queuedReturnQty(receiptId, lineId) : null);
    } catch (caught) {
      if (grinMutationErrorMessage(caught, t, "grin.errReturn").retired) {
        maskRetired();
        setError(t("grin.errSessionRetired"));
        return;
      }
      setRecord(null);
      setQueuedReturn(null);
    }
  }, [maskRetired, origin, receiptId, t]);

  useGrinFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const line = record?.effective.lines[0];

  const onSave = useCallback(() => {
    if (!receiptId || !line) return;
    try {
      originRepo(origin).dispatchReturn({
        receiptId,
        reason,
        lineId: line.lineId,
        returnQty: quantity(qty.trim(), line.unit),
      });
      router.back();
    } catch (caught) {
      const mapped = grinMutationErrorMessage(caught, t, "grin.errReturn");
      if (mapped.retired) maskRetired();
      setError(mapped.message);
    }
  }, [line, maskRetired, origin, qty, reason, receiptId, router, t]);

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
            value={queuedReturn ? `${queuedReturn.value} ${queuedReturn.unit}` : t("grin.projection.incomplete")}
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
