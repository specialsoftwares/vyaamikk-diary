import React, { useCallback, useMemo, useRef, useState } from "react";

import { quantity } from "@/goodsEvidence/quantities";
import type { GrinConfirmedProjection } from "@/goodsEvidence/ports";
import type { GrinApplicationRecord } from "@/services/grin/repository";
import {
  formatReportedArrivalDisplay,
  returnableLinesFromRecord,
} from "@/services/grin/repository/grinReceiptSearch";
import type { GrinReturnPlan } from "@/services/grin/repository/grinReturnPlan";
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

function returnLineStatusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case "pending_submit":
      return t("grin.returnStatus.pendingSubmit");
    case "queued":
      return t("grin.returnStatus.queued");
    case "awaiting_confirmation":
      return t("grin.returnStatus.awaitingConfirmation");
    case "confirmed":
      return t("grin.returnStatus.confirmed");
    case "failed":
      return t("grin.returnStatus.failed");
    case "conflicted":
      return t("grin.returnStatus.conflicted");
    case "stopped_version_conflict":
      return t("grin.returnStatus.versionConflict");
    default:
      return t("grin.projection.incomplete");
  }
}

/**
 * Multi-line return against a selected receipt.
 * Submits via durable per-line dispatchReturn sequence: queue ≠ confirm.
 * Each dependent line uses a fresh confirmed.eventVersion after prior confirm.
 * Client balances are display-only — server admits quantities.
 */
export function GrinReturnAdmittedBody({ session }: { session: GrinDispatchSession }): React.ReactElement {
  const origin = useFrozenGrinOrigin(session);
  const t = useGrinT();
  const router = useGrinRouter();
  const { receiptId } = useGrinLocalSearchParams<{ receiptId: string }>();
  const [record, setRecord] = useState<GrinApplicationRecord | null>(null);
  const [confirmed, setConfirmed] = useState<GrinConfirmedProjection | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<GrinReturnPlan | null>(null);
  const [eligibilityOk, setEligibilityOk] = useState(true);
  const [eligibilityReason, setEligibilityReason] = useState<string | null>(null);
  const didAutoSelect = useRef(false);
  const userClearedSelection = useRef(false);

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
      meta: { fontSize: 13, color: c.textMuted },
    })
  );

  const maskRetired = useCallback(() => {
    setRecord(null);
    setConfirmed(null);
    setSelected({});
    setReason("");
    setPlan(null);
    didAutoSelect.current = false;
    userClearedSelection.current = false;
  }, []);

  const load = useCallback(() => {
    if (!receiptId) {
      setRecord(null);
      setConfirmed(null);
      return;
    }
    try {
      const repo = originRepo(origin);
      const loaded = repo.get(receiptId);
      setRecord(loaded);
      setConfirmed(repo.confirmedProjection(receiptId));
      const eligibility = repo.returnEligibility(receiptId);
      setEligibilityOk(eligibility.ok);
      setEligibilityReason(eligibility.ok ? null : eligibility.reason);
      const existingPlan = repo.getReturnPlan(receiptId);
      if (existingPlan) setPlan(existingPlan);
    } catch (caught) {
      if (grinMutationErrorMessage(caught, t, "grin.errReturn").retired) {
        maskRetired();
        setError(t("grin.errSessionRetired"));
        return;
      }
      setRecord(null);
      setConfirmed(null);
    }
  }, [maskRetired, origin, receiptId, t]);

  useGrinFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const lines = useMemo(() => {
    if (!record) return [];
    return returnableLinesFromRecord(record, {
      queuedByLine: (lineId) => originRepo(origin).queuedReturnQty(record.receiptId, lineId),
      confirmed,
    });
  }, [confirmed, origin, record]);

  // Auto-select first line once on load — not again after the user clears selection.
  React.useEffect(() => {
    if (!record) {
      didAutoSelect.current = false;
      return;
    }
    if (didAutoSelect.current || userClearedSelection.current) return;
    if (Object.keys(selected).length > 0) {
      didAutoSelect.current = true;
      return;
    }
    const first = record.effective.lines[0]?.lineId;
    if (first) {
      setSelected({ [first]: "" });
      didAutoSelect.current = true;
    }
  }, [record, selected]);

  const toggleLine = useCallback((lineId: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (lineId in next) {
        delete next[lineId];
        if (Object.keys(next).length === 0) userClearedSelection.current = true;
      } else {
        next[lineId] = "";
      }
      return next;
    });
  }, []);

  const primaryLineId = record?.effective.lines[0]?.lineId ?? null;
  const supplierName =
    record?.effective.supplier.name.kind === "present" ? record.effective.supplier.name.value : null;
  const supplierGstin =
    record?.effective.supplier.registration.kind === "registered"
      ? record.effective.supplier.registration.gstin
      : null;

  const onSave = useCallback(() => {
    if (!receiptId || !record) return;
    if (!reason.trim()) {
      setError(t("grin.errReturnReason"));
      return;
    }
    const picks = Object.entries(selected).filter(([, qty]) => qty.trim().length > 0);
    if (picks.length === 0) {
      setError(t("grin.errReturn"));
      return;
    }
    for (const [lineId, qtyRaw] of picks) {
      const line = record.effective.lines.find((l) => l.lineId === lineId);
      if (!line) {
        setError(t("grin.errReturn"));
        return;
      }
      try {
        quantity(qtyRaw.trim(), line.unit);
      } catch {
        setError(t("grin.errReturn"));
        return;
      }
    }

    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const nextPlan = await originRepo(origin).dispatchReturnSequence({
          receiptId,
          reason,
          lines: picks.map(([lineId, qtyRaw]) => {
            const line = record.effective.lines.find((l) => l.lineId === lineId)!;
            return { lineId, returnQty: quantity(qtyRaw.trim(), line.unit) };
          }),
        });
        setPlan(nextPlan);
        const anyFailed = nextPlan.lines.some(
          (line) =>
            line.status === "failed" ||
            line.status === "conflicted" ||
            line.status === "stopped_version_conflict"
        );
        const allConfirmed = nextPlan.lines.every((line) => line.status === "confirmed");
        const anyPending = nextPlan.lines.some(
          (line) =>
            line.status === "queued" ||
            line.status === "awaiting_confirmation" ||
            line.status === "pending_submit"
        );
        if (allConfirmed) {
          router.back();
          return;
        }
        if (anyFailed) {
          setError(t("grin.errReturnPartial"));
        } else if (anyPending) {
          setError(t("grin.returnQueuedNotConfirmed"));
        }
      } catch (caught) {
        const mapped = grinMutationErrorMessage(caught, t, "grin.errReturn");
        if (mapped.retired) {
          maskRetired();
          setError(t("grin.errSessionRetired"));
          return;
        }
        if (caught instanceof Error && caught.message === "return_flight_in_progress") {
          setError(t("grin.errReturnInFlight"));
          return;
        }
        setError(mapped.message);
      } finally {
        setBusy(false);
      }
    })();
  }, [maskRetired, origin, reason, receiptId, record, router, selected, t]);

  const lineStatusById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const line of plan?.lines ?? []) map[line.lineId] = line.status;
    return map;
  }, [plan]);

  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Header title={t("grin.returnTitle")} subtitle={t("grin.returnIntro")} showBack />
        <GrinFixtureNotices />
        <Banner tone="info" message={t("grin.returnUnitHint")} />
        <Banner tone="info" message={t("grin.returnReplacementNote")} />
        {error ? <Banner tone="danger" message={error} /> : null}
        {record ? (
          <FormSection title={t("grin.returnReceiptSummary")}>
            <GrinFieldRow
              label={t("grin.returnReceiptId")}
              value={record.issuedNumber ?? record.receiptId}
            />
            <GrinFieldRow
              label={t("grin.field.supplierName")}
              value={supplierName ?? t("grin.optional.notSupplied")}
            />
            <GrinFieldRow
              label={t("grin.field.supplierGstin")}
              value={supplierGstin ?? t("grin.optional.notSupplied")}
            />
            <GrinFieldRow
              label={t("grin.field.reportedArrival")}
              value={formatReportedArrivalDisplay(record.effective, t("grin.arrival.notRecorded"))}
            />
            {!eligibilityOk && eligibilityReason ? (
              <Banner tone="danger" message={t(`grin.returnIneligible.${eligibilityReason}`)} />
            ) : null}
          </FormSection>
        ) : null}
        {lines.length === 0 ? (
          <Text style={styles.lineTitle}>{t("grin.returnNoLines")}</Text>
        ) : (
          <FormSection title={t("grin.returnLineSelect")}>
            {lines.map((line) => {
              const active = line.lineId in selected;
              return (
                <View key={line.lineId} style={styles.lineCard}>
                  <Text style={styles.lineTitle}>{line.description}</Text>
                  <Text style={styles.meta}>{line.unit}</Text>
                  <Button
                    label={active ? t("common.remove") : t("common.add")}
                    onPress={() => toggleLine(line.lineId)}
                    variant="ghost"
                  />
                  <GrinFieldRow label={t("grin.returnOriginalQty")} value={line.originallyReceived} />
                  <GrinFieldRow
                    label={t("grin.returnConfirmedReturned")}
                    value={line.confirmedReturned ?? t("grin.projection.incomplete")}
                  />
                  <GrinFieldRow
                    label={t("grin.returnPendingReturn")}
                    value={line.pendingReturn ?? t("grin.returnNonePending")}
                  />
                  <GrinFieldRow
                    label={t("grin.returnAvailable")}
                    value={line.availableRemaining ?? t("grin.projection.incomplete")}
                  />
                  <GrinFieldRow label={t("grin.returnBatchLot")} value={t("grin.returnBatchNotRecorded")} />
                  {active && line.lineId !== primaryLineId ? (
                    <TextField
                      label={t("grin.returnPickLineQty")}
                      value={selected[line.lineId] ?? ""}
                      onChangeText={(v: string) => setSelected((prev) => ({ ...prev, [line.lineId]: v }))}
                      keyboardType="decimal-pad"
                      hint={line.unit}
                    />
                  ) : null}
                  {lineStatusById[line.lineId] ? (
                    <Text style={styles.toggle}>
                      {returnLineStatusLabel(lineStatusById[line.lineId]!, t)}
                    </Text>
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
            onChangeText={(v: string) => setSelected((prev) => ({ ...prev, [primaryLineId]: v }))}
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
        <Button
          label={t("common.save")}
          onPress={onSave}
          loading={busy}
          disabled={busy || !eligibilityOk}
        />
      </View>
    </Screen>
  );
}
