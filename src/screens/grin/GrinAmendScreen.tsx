import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Banner, Button, FormSection, Header, Screen, TextField } from "@/components/ui";
import { useT } from "@/i18n";
import { GRIN_FIXTURE_REPOSITORY_LABEL, getGrinFixtureRepository, presentText } from "@/services/grin/fixture";
import { formatOptionalText } from "@/services/grin/grinDisplay";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmissionGate, GrinFixtureNotices } from "./GrinAdmissionGate";
import { GrinFieldRow } from "./GrinFieldRow";

export function GrinAmendScreen(): React.ReactElement {
  const t = useT();
  const router = useRouter();
  const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
  const record = receiptId ? getGrinFixtureRepository().get(receiptId) : null;
  const [remarks, setRemarks] = useState(
    record?.effective.remarks.kind === "present" ? record.effective.remarks.value : ""
  );
  const [warehouse, setWarehouse] = useState(
    record?.effective.warehouse.kind === "present" ? record.effective.warehouse.value : ""
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const styles = useThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const onSave = useCallback(() => {
    if (!receiptId) return;
    const result = getGrinFixtureRepository().amend({
      receiptId,
      reason,
      changes: {
        remarks: presentText(remarks),
        warehouse: presentText(warehouse),
      },
    });
    if (!result.ok) {
      setError(t(result.userMessageKey));
      return;
    }
    router.back();
  }, [receiptId, reason, remarks, router, t, warehouse]);

  return (
    <GrinAdmissionGate title={t("grin.amendTitle")}>
      <Screen scroll>
        <View style={styles.wrap}>
          <Header title={t("grin.amendTitle")} subtitle={t("grin.amendIntro")} showBack />
          <GrinFixtureNotices repositoryLabel={GRIN_FIXTURE_REPOSITORY_LABEL} />
          <Banner tone="info" message={t("grin.originalUnchanged")} />
          {error ? <Banner tone="danger" message={error} /> : null}
          <FormSection title={t("grin.section.remarks")}>
            <GrinFieldRow
              label={t("grin.originalUnchanged")}
              value={formatOptionalText(record?.original.remarks ?? { kind: "not_supplied" }, t)}
            />
            <TextField
              label={t("grin.field.warehouse")}
              value={warehouse}
              onChangeText={setWarehouse}
              accessibilityLabel={t("grin.field.warehouse")}
            />
            <TextField
              label={t("grin.field.remarks")}
              value={remarks}
              onChangeText={setRemarks}
              multiline
              accessibilityLabel={t("grin.field.remarks")}
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
