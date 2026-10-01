import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Banner, Button, FormSection, Header, Screen, TextField } from "@/components/ui";
import { useT } from "@/i18n";
import { GRIN_FIXTURE_REPOSITORY_LABEL, getGrinFixtureRepository } from "@/services/grin/fixture";
import { formatQuantity } from "@/services/grin/grinDisplay";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmissionGate, GrinFixtureNotices } from "./GrinAdmissionGate";
import { GrinFieldRow } from "./GrinFieldRow";

export function GrinReturnScreen(): React.ReactElement {
  const t = useT();
  const router = useRouter();
  const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
  const record = receiptId ? getGrinFixtureRepository().get(receiptId) : null;
  const line = record?.effective.lines[0];
  const ledger = line ? record?.lineLedgers[line.lineId] : null;
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const styles = useThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const onSave = useCallback(() => {
    if (!receiptId || !line) return;
    const result = getGrinFixtureRepository().dispatchReturn({
      receiptId,
      reason,
      lineId: line.lineId,
      returnQtyValue: qty,
      returnQtyUnit: line.unit,
    });
    if (!result.ok) {
      setError(t(result.userMessageKey));
      return;
    }
    router.back();
  }, [line, qty, reason, receiptId, router, t]);

  return (
    <GrinAdmissionGate title={t("grin.returnTitle")}>
      <Screen scroll>
        <View style={styles.wrap}>
          <Header title={t("grin.returnTitle")} subtitle={t("grin.returnIntro")} showBack />
          <GrinFixtureNotices repositoryLabel={GRIN_FIXTURE_REPOSITORY_LABEL} />
          <Banner tone="info" message={t("grin.returnUnitHint")} />
          <Banner tone="info" message={t("grin.returnWeightSeparate")} />
          <Banner tone="info" message={t("grin.returnPackagesSeparate")} />
          {error ? <Banner tone="danger" message={error} /> : null}
          <FormSection title={t("grin.section.lines")}>
            <GrinFieldRow label={t("grin.field.receivedQty")} value={formatQuantity(ledger?.physicalReceived ?? null, t)} />
            <GrinFieldRow label={t("grin.field.returnQty")} value={formatQuantity(ledger?.dispatchedReturn ?? null, t)} />
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
    </GrinAdmissionGate>
  );
}
