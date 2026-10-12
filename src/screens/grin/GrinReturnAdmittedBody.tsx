import React, { useCallback, useMemo, useRef, useState } from "react";

import { quantity } from "@/goodsEvidence/quantities";
import type { GrinConfirmedProjection } from "@/goodsEvidence/ports";
import type { GrinApplicationRecord } from "@/services/grin/repository";
import {
  formatReportedArrivalDisplay,
  returnableLinesFromRecord,
} from "@/services/grin/repository/grinReceiptSearch";
import { mintSubmissionIntentId } from "@/services/grin/repository/grinMutationFlight";
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
 *
 * Completed-form rule: once the plan for the current intent (resumed or just
 * saved) is fully confirmed the screen enters a completed state. Save is a
 * no-op for that intent, per-line confirmed statuses stay visible, and only
 * the explicit "Start new return" action clears the form and mints a new
 * intent. A fresh mount with no saved plan also starts with a new intent.
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
  const [returnIntentId, setReturnIntentId] = useState(() => mintSubmissionIntentId());
  const [resuming, setResuming] = useState(false);
  /** Ref flips synchronously so a stale or same-tick Save cannot resubmit a completed intent. */
  const completedRef = useRef(false);
  const [completed, setCompleted] = useState(false);
  const [eligibilityOk, setEligibilityOk] = useState(true);
  const [eligibilityReason, setEligibilityReason] = useState<string | null>(null);
  const didAutoSelect = useRef(false);
  const userClearedSelection = useRef(false);

  const markCompleted = useCallback(() => {
    completedRef.current = true;
    setCompleted(true);
    setResuming(false);
  }, []);

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
      if (existingPlan) {
        setPlan(existingPlan);
        completedRef.current = false;
        setCompleted(false);
        setResuming(true);
        setReturnIntentId(existingPlan.intentId);
        setReason(existingPlan.reason);
        setSelected(
          Object.fromEntries(existingPlan.lines.map((line) => [line.lineId, line.returnQty.value]))
        );
        didAutoSelect.current = true;
        userClearedSelection.current = true;
        void repo.continueReturnPlan(receiptId).then((continued) => {
          if (!continued) return;
          setPlan(continued);
          const resumedDone =
            continued.lines.length > 0 && continued.lines.every((line) => line.status === "confirmed");
          // A completed resume stays completed. No new intent while reason and
          // quantities are still populated — only the explicit new-return action mints one.
          if (resumedDone) markCompleted();
        }).catch((caught) => {
          const mapped = grinMutationErrorMessage(caught, t, "grin.errReturn");
          if (mapped.retired) {
            maskRetired();
            setError(t("grin.errSessionRetired"));
            return;
          }
          setError(mapped.message);
        });
      }
    } catch (caught) {
      if (grinMutationErrorMessage(caught, t, "grin.errReturn").retired) {
        maskRetired();
        setError(t("grin.errSessionRetired"));
        return;
      }
      setRecord(null);
      setConfirmed(null);
    }
  }, [markCompleted, maskRetired, origin, receiptId, t]);

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

  /** Explicit new transaction: clear selection/reason/plan display and mint a new intent. */
  const startNewReturn = useCallback(() => {
    completedRef.current = false;
    setCompleted(false);
    setResuming(false);
    setPlan(null);
    setSelected({});
    setReason("");
    setError(null);
    didAutoSelect.current = false;
    userClearedSelection.current = false;
    setReturnIntentId(mintSubmissionIntentId());
  }, []);

  const onSave = useCallback(() => {
    // A completed intent never submits again; only startNewReturn re-arms Save.
    if (completedRef.current) return;
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
          intentId: returnIntentId,
          lines: picks.map(([lineId, qtyRaw]) => {
            const line = record.effective.lines.find((l) => l.lineId === lineId)!;
            return { lineId, returnQty: quantity(qtyRaw.trim(), line.unit) };
          }),
        });
        setPlan(nextPlan);
        const qtyBlocked = nextPlan.lines.some((line) => line.lastError === "quantity_edit_blocked");
        const anyFailed = nextPlan.lines.some(
          (line) =>
            line.status === "failed" ||
            line.status === "conflicted" ||
            line.status === "stopped_version_conflict"
        );
        const allConfirmed = nextPlan.lines.length > 0 && nextPlan.lines.every((line) => line.status === "confirmed");
        const anyPending = nextPlan.lines.some(
          (line) =>
            line.status === "queued" ||
            line.status === "awaiting_confirmation" ||
            line.status === "pending_submit"
        );
        if (allConfirmed) {
          // Completed: keep statuses visible, disable Save for this intent. If
          // router.back() is delayed, a second press must not create another return.
          markCompleted();
          router.back();
          return;
        }
        setResuming(true);
        if (qtyBlocked) {
          setError(t("grin.returnQuantityLocked"));
        } else if (anyFailed) {
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
        if (caught instanceof Error && caught.message === "return_intent_open") {
          setError(t("grin.returnIntentOpen"));
          return;
        }
        setError(mapped.message);
      } finally {
        setBusy(false);
      }
    })();
  }, [markCompleted, maskRetired, origin, reason, receiptId, record, returnIntentId, router, selected, t]);

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
        {resuming ? <Banner tone="info" message={t("grin.returnResuming")} /> : null}
        {completed ? (
          <>
            <Banner tone="success" message={t("grin.returnCompleted")} />
            <Button label={t("grin.returnStartNew")} onPress={startNewReturn} variant="secondary" />
          </>
        ) : null}
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
          disabled={busy || !eligibilityOk || completed}
        />
      </View>
    </Screen>
  );
}
