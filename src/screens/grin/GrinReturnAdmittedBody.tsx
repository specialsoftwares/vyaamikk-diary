import React, { useCallback, useMemo, useState } from "react";

import { quantity } from "@/goodsEvidence/quantities";
import type { GrinApplicationRecord } from "@/services/grin/repository";
import { returnableLinesFromRecord } from "@/services/grin/repository/grinReceiptSearch";
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
import { Banner, Button, FormSection, Header, Screen, TextField, View, StyleSheet, Text } from "./grinSurfaces";

/**
 * Multi-line return against a selected receipt.
 * Submits one existing dispatchReturn command per selected line with refreshed
 * expectedVersion between calls (atomic multi-line command remains deferred).
 * Client balances are display-only — server admits quantities.
 */
export function GrinReturnAdmittedBody({ session }: { session: GrinDispatchSession }): React.ReactElement {
  const origin = useFrozenGrinOrigin(session);
  const t = useGrinT();
  const router = useGrinRouter();
  const { receiptId } = useGrinLocalSearchParams<{ receiptId: string }>();
  const [record, setRecord] = useState<GrinApplicationRecord | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lineStatuses, setLineStatuses] = useState<Record<string, "ok" | "failed" | "skipped">>({});

  const styles = useGrinThemedStyles((c) =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
      lineCard: {
        gap: spacing.sm,
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: c.divider,
      },
      lineTitle: { fontSize: 16, fontWeight: "600", color: c.text },
      toggle: { fontSize: 13, fontWeight: "600", color: c.primary },
    })
  );

  const maskRetired = useCallback(() => {
    setRecord(null);
    setSelected({});
    setReason("");
    setLineStatuses({});
  }, []);

  const load = useCallback(() => {
    if (!receiptId) {
      setRecord(null);
      return;
    }
    try {
      const loaded = originRepo(origin).get(receiptId);
      setRecord(loaded);
    } catch (caught) {
      if (grinMutationErrorMessage(caught, t, "grin.errReturn").retired) {
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

  const lines = useMemo(() => {
    if (!record) return [];
    return returnableLinesFromRecord(record, (lineId) =>
      originRepo(origin).queuedReturnQty(record.receiptId, lineId)
    );
  }, [origin, record]);

  // Default-select first line so single-line receipts remain one-step (and host bind tests keep field keys).
  React.useEffect(() => {
    if (!record) return;
    if (Object.keys(selected).length > 0) return;
    const first = record.effective.lines[0]?.lineId;
    if (first) setSelected({ [first]: "" });
  }, [record, selected]);

  const toggleLine = useCallback((lineId: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (lineId in next) delete next[lineId];
      else next[lineId] = "";
      return next;
    });
  }, []);

  const primaryLineId = record?.effective.lines[0]?.lineId ?? null;

  const onSave = useCallback(() => {
    if (!receiptId || !record || busy) return;
    if (!reason.trim()) {
      setError(t("grin.errReturnReason"));
      return;
    }
    const picks = Object.entries(selected).filter(([, qty]) => qty.trim().length > 0);
    if (picks.length === 0) {
      setError(t("grin.errReturn"));
      return;
    }
    setBusy(true);
    setError(null);
    const statuses: Record<string, "ok" | "failed" | "skipped"> = {};
    try {
      for (const [lineId, qtyRaw] of picks) {
        const line = record.effective.lines.find((l) => l.lineId === lineId);
        if (!line) {
          statuses[lineId] = "skipped";
          continue;
        }
        try {
          originRepo(origin).dispatchReturn({
            receiptId,
            reason,
            lineId,
            returnQty: quantity(qtyRaw.trim(), line.unit),
          });
          statuses[lineId] = "ok";
        } catch (caught) {
          const mapped = grinMutationErrorMessage(caught, t, "grin.errReturn");
          if (mapped.retired) {
            maskRetired();
            setError(t("grin.errSessionRetired"));
            setLineStatuses(statuses);
            return;
          }
          statuses[lineId] = "failed";
          setError(mapped.message);
        }
      }
      setLineStatuses(statuses);
      const anyOk = Object.values(statuses).some((s) => s === "ok");
      const anyFail = Object.values(statuses).some((s) => s === "failed");
      if (anyOk && !anyFail) {
        router.back();
      }
    } finally {
      setBusy(false);
    }
  }, [busy, maskRetired, origin, reason, receiptId, record, router, selected, t]);

  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Header title={t("grin.returnTitle")} subtitle={t("grin.returnIntro")} showBack />
        <GrinFixtureNotices />
        <Banner tone="info" message={t("grin.returnUnitHint")} />
        <Banner tone="info" message={t("grin.returnReplacementNote")} />
        {error ? <Banner tone="danger" message={error} /> : null}
        {lines.length === 0 ? (
          <Text style={styles.lineTitle}>{t("grin.returnNoLines")}</Text>
        ) : (
          <FormSection title={t("grin.returnLineSelect")}>
            {lines.map((line) => {
              const active = line.lineId in selected;
              return (
                <View key={line.lineId} style={styles.lineCard}>
                  <Text style={styles.lineTitle}>{line.description}</Text>
                  <Button
                    label={active ? t("common.remove") : t("common.add")}
                    onPress={() => toggleLine(line.lineId)}
                    variant="ghost"
                  />
                  <GrinFieldRow label={t("grin.returnOriginalQty")} value={line.originallyReceived} />
                  <GrinFieldRow
                    label={t("grin.returnAlreadyReturned")}
                    value={line.pendingOrReturned ?? t("grin.projection.incomplete")}
                  />
                  <GrinFieldRow label={t("grin.returnBatchNotRecorded")} value={t("grin.returnBatchNotRecorded")} />
                  {active && line.lineId !== primaryLineId ? (
                    <TextField
                      label={t("grin.returnPickLineQty")}
                      value={selected[line.lineId] ?? ""}
                      onChangeText={(v) => setSelected((prev) => ({ ...prev, [line.lineId]: v }))}
                      keyboardType="decimal-pad"
                      hint={line.unit}
                    />
                  ) : null}
                  {lineStatuses[line.lineId] ? (
                    <Text style={styles.toggle}>{lineStatuses[line.lineId]}</Text>
                  ) : null}
                </View>
              );
            })}
          </FormSection>
        )}
        {primaryLineId && primaryLineId in selected ? (
          <TextField
            label={t("grin.returnQty")}
            value={selected[primaryLineId] ?? ""}
            onChangeText={(v) => setSelected((prev) => ({ ...prev, [primaryLineId]: v }))}
            keyboardType="decimal-pad"
            accessibilityLabel={t("grin.returnQty")}
          />
        ) : null}
        <TextField
          label={t("grin.field.reason")}
          value={reason}
          onChangeText={setReason}
          multiline
          accessibilityLabel={t("grin.field.reason")}
        />
        <Button label={t("common.save")} onPress={onSave} loading={busy} disabled={busy} />
      </View>
    </Screen>
  );
}
