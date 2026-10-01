import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { Banner, Button, FormSection, Header, Screen, TextField } from "@/components/ui";
import { useT } from "@/i18n";
import {
  GRIN_MUTATION_QUEUE_UNINJECTED,
  presentText,
  requireLiveGrinApplicationRepository,
  type GrinApplicationRecord,
} from "@/services/grin/repository";
import { formatOptionalText } from "@/services/grin/grinDisplay";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmissionGate, GrinFixtureNotices } from "./GrinAdmissionGate";
import { GrinFieldRow } from "./GrinFieldRow";

export function GrinAmendScreen(): React.ReactElement {
  const t = useT();
  return (
    <GrinAdmissionGate title={t("grin.amendTitle")}>
      <GrinAmendAdmittedBody />
    </GrinAdmissionGate>
  );
}

function GrinAmendAdmittedBody(): React.ReactElement {
  const t = useT();
  const router = useRouter();
  const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
  const [record, setRecord] = useState<GrinApplicationRecord | null>(null);
  const [remarks, setRemarks] = useState("");
  const [warehouse, setWarehouse] = useState("");
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

  React.useEffect(() => {
    if (!record) return;
    setRemarks(record.effective.remarks.kind === "present" ? record.effective.remarks.value : "");
    setWarehouse(record.effective.warehouse.kind === "present" ? record.effective.warehouse.value : "");
  }, [record]);

  const onSave = useCallback(() => {
    if (!receiptId) return;
    try {
      requireLiveGrinApplicationRepository().amend({
        receiptId,
        reason,
        changes: {
          remarks: presentText(remarks),
          warehouse: presentText(warehouse),
        },
      });
      router.back();
    } catch (caught) {
      if (caught instanceof Error && caught.message === "amend_reason_required") {
        setError(t("grin.errAmendReason"));
        return;
      }
      if (caught instanceof Error && caught.message === GRIN_MUTATION_QUEUE_UNINJECTED) {
        setError(t("grin.mutationUnavailable"));
        return;
      }
      setError(t("grin.errSave"));
    }
  }, [receiptId, reason, remarks, router, t, warehouse]);

  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Header title={t("grin.amendTitle")} subtitle={t("grin.amendIntro")} showBack />
        <GrinFixtureNotices />
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
  );
}
