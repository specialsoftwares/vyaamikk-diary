import React, { useCallback, useState } from "react";

import { presentText, type GrinApplicationRecord } from "@/services/grin/repository";
import { formatOptionalText } from "@/services/grin/grinDisplay";
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

export function GrinAmendAdmittedBody({
  session,
}: {
  session: GrinDispatchSession;
}): React.ReactElement {
  const origin = useFrozenGrinOrigin(session);
  const t = useGrinT();
  const router = useGrinRouter();
  const { receiptId } = useGrinLocalSearchParams<{ receiptId: string }>();
  const [record, setRecord] = useState<GrinApplicationRecord | null>(null);
  const [remarks, setRemarks] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const styles = useGrinThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const maskRetired = useCallback(() => {
    setRecord(null);
    setRemarks("");
    setWarehouse("");
    setReason("");
  }, []);

  const load = useCallback(() => {
    if (!receiptId) {
      setRecord(null);
      return;
    }
    try {
      setRecord(originRepo(origin).get(receiptId));
    } catch (caught) {
      if (grinMutationErrorMessage(caught, t, "grin.errSave").retired) {
        maskRetired();
        setError(t("grin.errSessionRetired"));
        return;
      }
      setRecord(null);
    }
  }, [maskRetired, origin, receiptId, t]);

  useGrinFocusEffect(
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
      originRepo(origin).amend({
        receiptId,
        reason,
        changes: {
          remarks: presentText(remarks),
          warehouse: presentText(warehouse),
        },
      });
      router.back();
    } catch (caught) {
      const mapped = grinMutationErrorMessage(caught, t, "grin.errSave");
      if (mapped.retired) {
        maskRetired();
      }
      setError(mapped.message);
    }
  }, [maskRetired, origin, receiptId, reason, remarks, router, t, warehouse]);

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
