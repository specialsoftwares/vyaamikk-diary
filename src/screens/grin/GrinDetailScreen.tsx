import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { Banner, Button, Card, EmptyState, FormSection, Header, Screen } from "@/components/ui";
import { useT } from "@/i18n";
import {
  requireLiveGrinApplicationRepository,
  type GrinApplicationLookup,
} from "@/services/grin/repository";
import {
  ackLabel,
  captureLabel,
  custodyLabel,
  formatMoneyMinor,
  formatOptionalText,
  formatQuantity,
  localStateLabel,
  offlinePendingBannerText,
  qcLabel,
  shortageLabel,
} from "@/services/grin/grinDisplay";
import { generateGrinReceiptPdf } from "@/services/grin/pdf/grinPdfAdapter";
import { pdfService } from "@/services/pdf/pdfService";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmissionGate, GrinFixtureNotices } from "./GrinAdmissionGate";
import { GrinFieldRow } from "./GrinFieldRow";

export function GrinDetailScreen(): React.ReactElement {
  const t = useT();
  return (
    <GrinAdmissionGate title={t("grin.detailTitle")}>
      <GrinDetailAdmittedBody />
    </GrinAdmissionGate>
  );
}

function GrinDetailAdmittedBody(): React.ReactElement {
  const t = useT();
  const router = useRouter();
  const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
  const [lookup, setLookup] = useState<GrinApplicationLookup | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const styles = useThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
      actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    })
  );

  const load = useCallback(() => {
    if (!receiptId) {
      setLookup(null);
      return;
    }
    try {
      setLookup(requireLiveGrinApplicationRepository().lookup(receiptId));
    } catch {
      setLookup(null);
    }
  }, [receiptId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const go = useCallback(
    (segment: string) => {
      if (!receiptId) return;
      router.push(`/(app)/grin/${receiptId}/${segment}`);
    },
    [receiptId, router]
  );

  const onPdf = useCallback(async () => {
    if (!lookup || lookup.projection !== "readable") return;
    setBusy(true);
    setActionError(null);
    try {
      requireLiveGrinApplicationRepository();
      const pdf = await generateGrinReceiptPdf({ record: lookup, t });
      try {
        await pdfService.share(pdf);
      } catch {
        // dismissed
      }
    } catch {
      setActionError(t("grin.shareFailed"));
    } finally {
      setBusy(false);
    }
  }, [lookup, t]);

  if (!lookup) {
    return (
      <Screen>
        <View style={styles.wrap}>
          <Header title={t("grin.detailTitle")} showBack />
          <EmptyState title={t("grin.notFound")} />
        </View>
      </Screen>
    );
  }

  if (lookup.projection === "unknown_incomplete") {
    return (
      <Screen scroll>
        <View style={styles.wrap}>
          <Header title={t("grin.detailTitle")} showBack />
          <GrinFixtureNotices />
          <Banner tone="warning" message={t("grin.projection.incomplete")} />
          <GrinFieldRow label={t("grin.field.grinNumber")} value={lookup.issuedNumber ?? t("grin.pdf.pendingNumber")} />
          <GrinFieldRow label={t("grin.local.issued")} value={localStateLabel(lookup.localState, t)} />
        </View>
      </Screen>
    );
  }

  const record = lookup;
  const grin = record.effective;
  const original = record.original;
  const line = grin.lines[0];
  const ewbLabel =
    grin.ewb.kind === "present"
      ? `${grin.ewb.ebn} (${grin.ewb.generatedBy})`
      : grin.ewb.kind === "unknown"
        ? t("grin.ewbUnknownExplicit")
        : grin.ewb.kind === "not_applicable"
          ? grin.ewb.reason
          : t("grin.optional.notSupplied");

  return (
    <Screen scroll>
        <View style={styles.wrap}>
          <Header
            title={grin.issuedNumber ?? t("grin.pdf.pendingNumber")}
            subtitle={t("grin.detailTitle")}
            showBack
          />
          <GrinFixtureNotices />
          {record.localState !== "issued" || grin.issuedNumber == null ? (
            <Banner tone="warning" message={offlinePendingBannerText(t)} />
          ) : null}
          {actionError ? <Banner tone="danger" message={actionError} /> : null}

          <FormSection title={t("grin.section.identity")}>
            <GrinFieldRow label={t("grin.field.grinNumber")} value={grin.issuedNumber ?? t("grin.pdf.pendingNumber")} />
            <GrinFieldRow label={t("grin.field.custody")} value={custodyLabel(grin.custody, t)} />
            <GrinFieldRow label={t("grin.local.issued")} value={localStateLabel(record.localState, t)} />
            {record.gateRefusal === "refused_at_gate" ? (
              <GrinFieldRow label={t("grin.gateRejection")} value={t("grin.gateRejection")} />
            ) : null}
            {record.gateRefusal === "received_then_rejected" ? (
              <GrinFieldRow label={t("grin.receivedThenRejected")} value={t("grin.receivedThenRejected")} />
            ) : null}
          </FormSection>

          <FormSection title={t("grin.section.times")} subtitle={t("grin.registrationVsArrival")}>
            <GrinFieldRow label={t("grin.field.registrationTime")} value={grin.serverRegisteredAtUtc ?? t("grin.pdf.pendingNumber")} />
            <GrinFieldRow
              label={t("grin.field.reportedArrival")}
              value={`${grin.reportedArrivalAt} (${grin.reportedArrivalTimeZone})`}
            />
            <GrinFieldRow label={t("grin.field.capture")} value={captureLabel(grin.captureProvenance, t)} />
          </FormSection>

          <FormSection title={t("grin.section.supplier")}>
            <GrinFieldRow label={t("grin.field.supplierName")} value={formatOptionalText(grin.supplier.name, t)} />
            <GrinFieldRow
              label={t("grin.field.supplierGstin")}
              value={
                grin.supplier.registration.kind === "registered"
                  ? grin.supplier.registration.gstin
                  : grin.supplier.registration.kind === "unregistered"
                    ? t("grin.supplierReg.unregistered")
                    : t("grin.supplierReg.notSupplied")
              }
            />
            <GrinFieldRow label={t("grin.field.buyerName")} value={grin.buyer.legalName} />
            <GrinFieldRow label={t("grin.field.buyerGstin")} value={formatOptionalText(grin.buyer.gstin, t)} />
          </FormSection>

          <FormSection title={t("grin.section.commercial")}>
            <GrinFieldRow label={t("grin.field.invoiceNumber")} value={formatOptionalText(grin.commercial.supplierInvoiceNumber, t)} />
            <GrinFieldRow label={t("grin.field.invoiceDate")} value={formatOptionalText(grin.commercial.supplierInvoiceDate, t)} />
            <GrinFieldRow label={t("grin.field.invoiceValue")} value={formatMoneyMinor(grin.commercial.supplierInvoiceValue, t)} />
            <GrinFieldRow label={t("grin.field.po")} value={formatOptionalText(grin.commercial.purchaseOrderNumber, t)} />
            <GrinFieldRow label={t("grin.field.challan")} value={formatOptionalText(grin.commercial.challanNumber, t)} />
          </FormSection>

          <FormSection title={t("grin.section.ewb")}>
            <GrinFieldRow label={t("grin.field.ewb")} value={ewbLabel} />
            {grin.ewb.kind === "present" ? (
              <GrinFieldRow label={t("grin.field.ewbGenerator")} value={grin.ewb.generatedBy} />
            ) : null}
          </FormSection>

          <FormSection title={t("grin.section.transport")}>
            <GrinFieldRow label={t("grin.field.vehicle")} value={formatOptionalText(grin.transport.vehicleNumber, t)} />
            <GrinFieldRow label={t("grin.field.transporter")} value={formatOptionalText(grin.transport.transporterName, t)} />
            <GrinFieldRow label={t("grin.field.lr")} value={formatOptionalText(grin.transport.lrNumber, t)} />
          </FormSection>

          {line ? (
            <FormSection title={t("grin.section.lines")}>
              <GrinFieldRow label={t("grin.field.material")} value={line.description} />
              <GrinFieldRow label={t("grin.field.hsn")} value={formatOptionalText(line.hsn, t)} />
              <GrinFieldRow label={t("grin.field.invoiceQty")} value={formatQuantity(line.invoiceQuantity, t)} />
              <GrinFieldRow label={t("grin.field.receivedQty")} value={formatQuantity(line.physicallyReceived, t)} />
              <GrinFieldRow label={t("grin.field.grossWeight")} value={formatQuantity(line.grossWeight, t)} />
              <GrinFieldRow label={t("grin.field.tareWeight")} value={formatQuantity(line.tareWeight, t)} />
              <GrinFieldRow label={t("grin.field.netWeight")} value={formatQuantity(line.netWeight, t)} />
              <GrinFieldRow label={t("grin.field.packageCount")} value={formatQuantity(line.packageCount, t)} />
              <GrinFieldRow label={t("grin.field.shortage")} value={shortageLabel(line.shortageOrExcess, t)} />
              <GrinFieldRow label={t("grin.field.damage")} value={formatOptionalText(line.condition, t)} />
              <GrinFieldRow label={t("grin.field.qc")} value={qcLabel(line.qcStatus, t)} />
            </FormSection>
          ) : null}

          <FormSection title={t("grin.section.warehouse")}>
            <GrinFieldRow label={t("grin.field.warehouse")} value={formatOptionalText(grin.warehouse, t)} />
            <GrinFieldRow label={t("grin.field.bin")} value={formatOptionalText(grin.locationBin, t)} />
            <GrinFieldRow
              label={t("grin.field.receivingEmployee")}
              value={formatOptionalText(grin.receivingEmployeeAttributed, t)}
            />
            <GrinFieldRow label={t("grin.field.qcEmployee")} value={formatOptionalText(grin.qualityCheckedByAttributed, t)} />
            <GrinFieldRow label={t("grin.attributionNotSignature")} value={t("grin.attributionNotSignature")} />
          </FormSection>

          <FormSection title={t("grin.section.ack")}>
            <GrinFieldRow label={t("grin.field.ack")} value={ackLabel(grin.acknowledgement.outcome, t)} />
            <GrinFieldRow label={t("grin.field.remarks")} value={formatOptionalText(grin.remarks, t)} />
          </FormSection>

          <Card elevated={false}>
            <GrinFieldRow
              label={t("grin.originalUnchanged")}
              value={original.issuedNumber ?? t("grin.pdf.pendingNumber")}
            />
          </Card>

          <View style={styles.actions}>
            <Button label={t("grin.action.inspect")} size="md" fullWidth={false} variant="secondary" onPress={() => go("qc")} />
            <Button label={t("grin.action.amend")} size="md" fullWidth={false} variant="secondary" onPress={() => go("amend")} />
            <Button label={t("grin.action.history")} size="md" fullWidth={false} variant="secondary" onPress={() => go("history")} />
            <Button label={t("grin.action.ewb")} size="md" fullWidth={false} variant="secondary" onPress={() => go("ewb")} />
            <Button label={t("grin.action.return")} size="md" fullWidth={false} variant="secondary" onPress={() => go("return")} />
            <Button label={t("grin.action.attachments")} size="md" fullWidth={false} variant="secondary" onPress={() => go("attachments")} />
            <Button label={t("grin.action.pack")} size="md" fullWidth={false} variant="secondary" onPress={() => go("pack")} />
            <Button label={t("grin.action.exceptions")} size="md" fullWidth={false} variant="secondary" onPress={() => go("exceptions")} />
            <Button label={t("grin.action.pdf")} size="md" fullWidth={false} loading={busy} onPress={() => void onPdf()} />
          </View>
        </View>
      </Screen>
  );
}
