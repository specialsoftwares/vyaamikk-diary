import React, { useCallback, useState } from "react";

import type { QcStatus } from "@/goodsEvidence/types";
import type { GrinApplicationRecord } from "@/services/grin/repository";
import { qcLabel } from "@/services/grin/grinDisplay";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { spacing } from "@/theme/spacing";

import { grinMutationErrorMessage } from "./grinActionErrors";
import { GrinChoiceRow } from "./GrinChoiceRow";
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

export function GrinQcAdmittedBody({ session }: { session: GrinDispatchSession }): React.ReactElement {
  const origin = useFrozenGrinOrigin(session);
  const t = useGrinT();
  const router = useGrinRouter();
  const { receiptId } = useGrinLocalSearchParams<{ receiptId: string }>();
  const [record, setRecord] = useState<GrinApplicationRecord | null>(null);
  const [status, setStatus] = useState<QcStatus>("hold");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const styles = useGrinThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const maskRetired = useCallback(() => {
    setRecord(null);
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

  const onSave = useCallback(() => {
    if (!receiptId) return;
    try {
      originRepo(origin).recordQc({ receiptId, reason, qcStatus: status });
      router.back();
    } catch (caught) {
      const mapped = grinMutationErrorMessage(caught, t, "grin.errSave");
      if (mapped.retired) maskRetired();
      setError(mapped.message);
    }
  }, [maskRetired, origin, receiptId, reason, router, status, t]);

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
