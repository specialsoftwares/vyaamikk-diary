import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Banner, Button, FormSection, Header, Screen, TextField } from "@/components/ui";
import { useT } from "@/i18n";
import type { QcStatus } from "@/goodsEvidence/types";
import { getGrinFixtureRepository } from "@/services/grin/fixture";
import { qcLabel } from "@/services/grin/grinDisplay";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmissionGate, GrinFixtureNotices } from "./GrinAdmissionGate";
import { GrinChoiceRow } from "./GrinChoiceRow";
import { GrinFieldRow } from "./GrinFieldRow";

export function GrinQcScreen(): React.ReactElement {
  const t = useT();
  const router = useRouter();
  const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
  const record = receiptId ? getGrinFixtureRepository().get(receiptId) : null;
  const [status, setStatus] = useState<QcStatus>(record?.view.qcStatus ?? "hold");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const styles = useThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const onSave = useCallback(() => {
    if (!receiptId) return;
    const result = getGrinFixtureRepository().recordQc({ receiptId, reason, qcStatus: status });
    if (!result.ok) {
      setError(t(result.userMessageKey));
      return;
    }
    router.back();
  }, [receiptId, reason, router, status, t]);

  return (
    <GrinAdmissionGate title={t("grin.qcTitle")}>
      <Screen scroll>
        <View style={styles.wrap}>
          <Header title={t("grin.qcTitle")} showBack />
          <GrinFixtureNotices />
          {error ? <Banner tone="danger" message={error} /> : null}
          <FormSection title={t("grin.section.inspection")}>
            <GrinFieldRow label={t("grin.field.qc")} value={qcLabel(record?.view.qcStatus ?? null, t)} />
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
    </GrinAdmissionGate>
  );
}
